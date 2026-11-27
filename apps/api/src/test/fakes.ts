import { randomUUID } from 'node:crypto';
import type { Business, Category, Product, Role, User } from '../db/schema.js';
import type { AuthUser, SessionService } from '../modules/auth/sessions.js';
import { EmailTakenError, type UserRepository } from '../modules/auth/users.js';
import { SlugTakenError, type BusinessService } from '../modules/businesses/businesses.js';
import type { MembershipLookup } from '../modules/businesses/memberships.js';
import {
  CategoryHasProductsError,
  CategoryNotFoundError,
  type CatalogService,
} from '../modules/catalog/catalog.js';

// Versiones en memoria de los servicios, para los tests.
// Cumplen la misma interfaz que las de Drizzle, así la app no nota la diferencia.

// `users` es la lista donde busca al resolver un token. Se lee en cada resolve,
// así que si le pasás fakeUsers().all ve también a los que se registren durante el test.
export function fakeSessions(users: AuthUser[] = []): SessionService & { tokens: Map<string, string> } {
  const tokens = new Map<string, string>(); // token -> userId
  let counter = 0;
  return {
    tokens,
    async create(userId) {
      const token = `token-${++counter}`;
      tokens.set(token, userId);
      return { token, expiresAt: new Date(Date.now() + 60_000) };
    },
    async resolve(token) {
      const userId = tokens.get(token);
      const user = users.find((u) => u.id === userId);
      // Como la versión real: solo estos tres campos, nunca el hash.
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    },
    async revoke(token) {
      tokens.delete(token);
    },
  };
}

export interface FakeMembership {
  userId: string;
  businessId: string;
  role: Role;
}

// `businesses` hace de tabla businesses para el join de listForUser.
export function fakeMemberships(
  entries: FakeMembership[] = [],
  businesses: Business[] = [],
): MembershipLookup & { entries: FakeMembership[]; businesses: Business[] } {
  return {
    entries,
    businesses,
    async getRole(userId, businessId) {
      return entries.find((e) => e.userId === userId && e.businessId === businessId)?.role ?? null;
    },
    async listForUser(userId) {
      return entries
        .filter((e) => e.userId === userId)
        .flatMap((e) => {
          const b = businesses.find((x) => x.id === e.businessId);
          return b ? [{ id: b.id, name: b.name, slug: b.slug, role: e.role }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

export function fakeUsers(initial: User[] = []): UserRepository & { all: User[] } {
  const all = [...initial];
  return {
    all,
    async findByEmail(email) {
      return all.find((u) => u.email === email) ?? null;
    },
    async create(data) {
      // Igual que el índice único de la base.
      if (all.some((u) => u.email === data.email)) throw new EmailTakenError();
      const now = new Date();
      const user: User = { id: randomUUID(), emailVerifiedAt: null, createdAt: now, updatedAt: now, ...data };
      all.push(user);
      return user;
    },
  };
}

// Un negocio completo con valores por defecto, para cargar datos en los tests.
export function makeBusiness(data: Partial<Business> & { name: string; slug: string }): Business {
  const now = new Date();
  return {
    id: randomUUID(),
    businessType: 'food',
    phone: null,
    address: null,
    timezone: 'America/Argentina/San_Luis',
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

// Escribe en las mismas listas que fakeMemberships, así después de crear un negocio
// /auth/me y requireRole lo ven, igual que con la base de verdad.
export function fakeBusinesses(memberships: ReturnType<typeof fakeMemberships>): BusinessService {
  return {
    async createWithOwner(ownerId, input) {
      if (memberships.businesses.some((b) => b.slug === input.slug)) throw new SlugTakenError();
      const business = makeBusiness({ name: input.name, slug: input.slug, phone: input.phone ?? null, address: input.address ?? null });
      memberships.businesses.push(business);
      memberships.entries.push({ userId: ownerId, businessId: business.id, role: 'owner' });
      return business;
    },
    async findById(id) {
      return memberships.businesses.find((b) => b.id === id) ?? null;
    },
  };
}

// Mismo comportamiento que la versión con Drizzle: todo filtrado por businessId,
// no deja borrar categorías con productos y valida que la categoría sea del local.
export function fakeCatalog(): CatalogService & { categories: Category[]; products: Product[] } {
  const categories: Category[] = [];
  const products: Product[] = [];
  const findCategory = (businessId: string, id: string) =>
    categories.find((c) => c.id === id && c.businessId === businessId);
  const findProduct = (businessId: string, id: string) =>
    products.find((p) => p.id === id && p.businessId === businessId);
  const nextPosition = (items: { position: number }[]) => Math.max(-1, ...items.map((i) => i.position)) + 1;
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

  return {
    categories,
    products,
    async getCatalog(businessId) {
      return {
        categories: categories
          .filter((c) => c.businessId === businessId)
          .sort(byPosition)
          .map((c) => ({ ...c, products: products.filter((p) => p.categoryId === c.id).sort(byPosition) })),
      };
    },
    async createCategory(businessId, input) {
      const now = new Date();
      const category: Category = {
        id: randomUUID(),
        businessId,
        name: input.name,
        position: nextPosition(categories.filter((c) => c.businessId === businessId)),
        createdAt: now,
        updatedAt: now,
      };
      categories.push(category);
      return category;
    },
    async updateCategory(businessId, categoryId, input) {
      const category = findCategory(businessId, categoryId);
      if (!category) return null;
      Object.assign(category, input, { updatedAt: new Date() });
      return category;
    },
    async deleteCategory(businessId, categoryId) {
      const category = findCategory(businessId, categoryId);
      if (!category) return false;
      if (products.some((p) => p.categoryId === categoryId)) throw new CategoryHasProductsError();
      categories.splice(categories.indexOf(category), 1);
      return true;
    },
    async createProduct(businessId, input) {
      if (!findCategory(businessId, input.categoryId)) throw new CategoryNotFoundError();
      const now = new Date();
      const product: Product = {
        id: randomUUID(),
        businessId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description || null,
        priceCents: input.priceCents,
        available: input.available,
        position: nextPosition(products.filter((p) => p.categoryId === input.categoryId)),
        createdAt: now,
        updatedAt: now,
      };
      products.push(product);
      return product;
    },
    async updateProduct(businessId, productId, input) {
      if (input.categoryId && !findCategory(businessId, input.categoryId)) throw new CategoryNotFoundError();
      const product = findProduct(businessId, productId);
      if (!product) return null;
      const description = input.description !== undefined ? { description: input.description || null } : {};
      Object.assign(product, input, description, { updatedAt: new Date() });
      return product;
    },
    async deleteProduct(businessId, productId) {
      const product = findProduct(businessId, productId);
      if (!product) return false;
      products.splice(products.indexOf(product), 1);
      return true;
    },
  };
}
