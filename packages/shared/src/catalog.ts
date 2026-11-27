import { z } from 'zod';

// Contratos del catálogo. Los montos van siempre en centavos (enteros):
// $4.500,50 se guarda y viaja como 450050.

const name = z.string().trim().min(1, 'Poné un nombre').max(80, 'Máximo 80 caracteres');

// Fotos: la web las achica antes de subirlas, así que 2 MB sobra.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

// Tope de $10.000.000 por producto: un precio más alto es casi seguro un error de tipeo.
export const MAX_PRICE_CENTS = 1_000_000_000;

// POST /businesses/:businessId/categories
export const categoryInputSchema = z.object({ name });
export type CategoryInput = z.infer<typeof categoryInputSchema>;

// PATCH /businesses/:businessId/categories/:categoryId (todo opcional: se cambia lo que venga)
export const categoryUpdateSchema = z.object({
  name: name.optional(),
  position: z.int().min(0).optional(),
});
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

const priceCents = z
  .int('El precio tiene que ser un número entero de centavos')
  .min(0, 'El precio no puede ser negativo')
  .max(MAX_PRICE_CENTS, 'El precio es demasiado alto');

const description = z.string().trim().max(300, 'Máximo 300 caracteres');

// POST /businesses/:businessId/products
export const productInputSchema = z.object({
  categoryId: z.uuid('Elegí una categoría'),
  name,
  // Vacío o ausente = sin descripción.
  description: description.optional(),
  priceCents,
  available: z.boolean().default(true),
});
export type ProductInput = z.input<typeof productInputSchema>;

// PATCH /businesses/:businessId/products/:productId
export const productUpdateSchema = z.object({
  categoryId: z.uuid('Elegí una categoría').optional(),
  name: name.optional(),
  // null borra la descripción.
  description: description.nullable().optional(),
  priceCents: priceCents.optional(),
  available: z.boolean().optional(),
  position: z.int().min(0).optional(),
});
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.int(),
  available: z.boolean(),
  position: z.int(),
  // URL lista para un <img>, o null si no tiene foto.
  imageUrl: z.string().nullable(),
});
export type ProductResponse = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.int(),
});
export type CategoryResponse = z.infer<typeof categorySchema>;

// GET /businesses/:businessId/catalog: categorías en orden, cada una con sus productos.
export const catalogResponseSchema = z.object({
  categories: z.array(categorySchema.extend({ products: z.array(productSchema) })),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;
