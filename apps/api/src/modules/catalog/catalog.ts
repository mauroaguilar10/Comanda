import type { CategoryInput, CategoryUpdate, ProductUpdate, productInputSchema } from '@comanda/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../db/client.js';
import { categories, products, type Category, type Product } from '../../db/schema.js';
import { isForeignKeyViolation } from '../../lib/db-errors.js';

// Lo que entra al crear un producto, ya validado (con `available` resuelto por el default).
export type ProductCreate = z.output<typeof productInputSchema>;

// La categoría no existe en ESTE local (puede existir en otro: para nosotros es lo mismo).
export class CategoryNotFoundError extends Error {
  constructor() {
    super('La categoría no existe');
    this.name = 'CategoryNotFoundError';
  }
}

export class CategoryHasProductsError extends Error {
  constructor() {
    super('La categoría tiene productos');
    this.name = 'CategoryHasProductsError';
  }
}

export interface CatalogWithProducts {
  categories: (Category & { products: Product[] })[];
}

// Todas las operaciones reciben el businessId y filtran por él. El id de la categoría o del
// producto viene de la URL: sin ese filtro, el encargado de un local podría editar el menú
// de otro con solo cambiar el id. requireRole ya verificó que trabaja en businessId.
export interface CatalogService {
  getCatalog(businessId: string): Promise<CatalogWithProducts>;
  createCategory(businessId: string, input: CategoryInput): Promise<Category>;
  // null si no existe en este local.
  updateCategory(businessId: string, categoryId: string, input: CategoryUpdate): Promise<Category | null>;
  // false si no existe. Tira CategoryHasProductsError si todavía tiene productos.
  deleteCategory(businessId: string, categoryId: string): Promise<boolean>;
  // Tira CategoryNotFoundError si la categoría no es de este local.
  createProduct(businessId: string, input: ProductCreate): Promise<Product>;
  updateProduct(businessId: string, productId: string, input: ProductUpdate): Promise<Product | null>;
  // Devuelve el producto borrado (para borrar también su foto), o null si no existía.
  deleteProduct(businessId: string, productId: string): Promise<Product | null>;
  // Cambia (o quita, con null) la foto. Devuelve la clave anterior para borrar ese archivo.
  setImage(
    businessId: string,
    productId: string,
    imageKey: string | null,
  ): Promise<{ product: Product; previousKey: string | null } | null>;
}

export function createCatalogService(db: Db): CatalogService {
  async function assertCategoryInBusiness(businessId: string, categoryId: string) {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.businessId, businessId)))
      .limit(1);
    if (!row) throw new CategoryNotFoundError();
  }

  return {
    async getCatalog(businessId) {
      // Dos consultas simples (categorías y productos) y las juntamos acá.
      // Un join devolvería una fila por producto y habría que reagrupar igual.
      const [cats, prods] = await Promise.all([
        db
          .select()
          .from(categories)
          .where(eq(categories.businessId, businessId))
          .orderBy(asc(categories.position), asc(categories.createdAt)),
        db
          .select()
          .from(products)
          .where(eq(products.businessId, businessId))
          .orderBy(asc(products.position), asc(products.createdAt)),
      ]);
      return {
        categories: cats.map((c) => ({ ...c, products: prods.filter((p) => p.categoryId === c.id) })),
      };
    },

    async createCategory(businessId, input) {
      const [row] = await db
        .insert(categories)
        .values({
          businessId,
          name: input.name,
          // Al final del menú: una posición más que la última.
          position: sql`(select coalesce(max(${categories.position}), -1) + 1 from ${categories} where ${categories.businessId} = ${businessId})`,
        })
        .returning();
      return row!;
    },

    async updateCategory(businessId, categoryId, input) {
      const where = and(eq(categories.id, categoryId), eq(categories.businessId, businessId));
      // Drizzle no acepta un UPDATE sin columnas: si no vino nada, devolvemos la categoría como está.
      if (Object.keys(input).length === 0) {
        const [row] = await db.select().from(categories).where(where).limit(1);
        return row ?? null;
      }
      const [row] = await db.update(categories).set(input).where(where).returning();
      return row ?? null;
    },

    async deleteCategory(businessId, categoryId) {
      try {
        const deleted = await db
          .delete(categories)
          .where(and(eq(categories.id, categoryId), eq(categories.businessId, businessId)))
          .returning({ id: categories.id });
        return deleted.length > 0;
      } catch (err) {
        // La clave foránea de products no deja borrarla: dejamos que la base decida
        // en vez de contar productos antes (entre el conteo y el borrado podría entrar uno).
        if (isForeignKeyViolation(err)) throw new CategoryHasProductsError();
        throw err;
      }
    },

    async createProduct(businessId, input) {
      await assertCategoryInBusiness(businessId, input.categoryId);
      const [row] = await db
        .insert(products)
        .values({
          businessId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description || null,
          priceCents: input.priceCents,
          available: input.available,
          // Al final de su categoría.
          position: sql`(select coalesce(max(${products.position}), -1) + 1 from ${products} where ${products.categoryId} = ${input.categoryId})`,
        })
        .returning();
      return row!;
    },

    async updateProduct(businessId, productId, input) {
      if (input.categoryId) await assertCategoryInBusiness(businessId, input.categoryId);
      const where = and(eq(products.id, productId), eq(products.businessId, businessId));
      const values = { ...input, ...(input.description !== undefined && { description: input.description || null }) };
      if (Object.keys(values).length === 0) {
        const [row] = await db.select().from(products).where(where).limit(1);
        return row ?? null;
      }
      const [row] = await db.update(products).set(values).where(where).returning();
      return row ?? null;
    },

    async deleteProduct(businessId, productId) {
      const [deleted] = await db
        .delete(products)
        .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
        .returning();
      return deleted ?? null;
    },

    async setImage(businessId, productId, imageKey) {
      return db.transaction(async (tx) => {
        const where = and(eq(products.id, productId), eq(products.businessId, businessId));
        // FOR UPDATE: si llegan dos fotos a la vez, cada una ve la clave que dejó la otra
        // y ningún archivo queda guardado sin que nadie lo apunte.
        const [current] = await tx.select({ imageKey: products.imageKey }).from(products).where(where).for('update');
        if (!current) return null;
        const [product] = await tx.update(products).set({ imageKey }).where(where).returning();
        return { product: product!, previousKey: current.imageKey };
      });
    },
  };
}
