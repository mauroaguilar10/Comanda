import {
  catalogResponseSchema,
  categoryInputSchema,
  categorySchema,
  categoryUpdateSchema,
  productInputSchema,
  productSchema,
  productUpdateSchema,
} from '@comanda/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../lib/validation.js';
import { requireRole } from '../../plugins/auth.js';
import type { MembershipLookup } from '../businesses/memberships.js';
import { CategoryHasProductsError, CategoryNotFoundError, type CatalogService } from './catalog.js';

export interface CatalogRoutesOptions {
  catalog: CatalogService;
  memberships: MembershipLookup;
}

const uuid = z.uuid();

const notFound = (reply: FastifyReply, what: 'category' | 'product') =>
  reply.code(404).send({
    error: 'not_found',
    message: what === 'category' ? 'No existe esa categoría.' : 'No existe ese producto.',
  });

// El 404 de "categoría inexistente" al crear o mover un producto es un error del formulario,
// no de la URL: lo devolvemos como 400 sobre el campo categoryId.
const categoryFieldError = (reply: FastifyReply) =>
  reply.code(400).send({
    error: 'validation_error',
    message: 'Esa categoría no existe en este local.',
    fields: { categoryId: ['Esa categoría no existe en este local.'] },
  });

// Se registra con prefix '/businesses/:businessId', así requireRole encuentra el :businessId.
export async function catalogRoutes(app: FastifyInstance, opts: CatalogRoutesOptions): Promise<void> {
  const { catalog, memberships } = opts;

  // Ver el menú: cualquiera que trabaje en el local (cocina necesita saber qué se vende).
  const anyMember = requireRole(memberships, 'manager', 'kitchen', 'driver');
  // Cambiar el menú: dueño (pasa siempre) y encargado.
  const managers = requireRole(memberships, 'manager');

  app.get('/catalog', { preHandler: anyMember }, async (request) => {
    const { businessId } = request.params as { businessId: string };
    // parse deja solo los campos públicos (saca businessId, fechas, etc.).
    return catalogResponseSchema.parse(await catalog.getCatalog(businessId));
  });

  app.post('/categories', { preHandler: managers }, async (request, reply) => {
    const { businessId } = request.params as { businessId: string };
    const parsed = categoryInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const category = await catalog.createCategory(businessId, parsed.data);
    return reply.code(201).send(categorySchema.parse(category));
  });

  app.patch('/categories/:categoryId', { preHandler: managers }, async (request, reply) => {
    const { businessId, categoryId } = request.params as { businessId: string; categoryId: string };
    // Un id que ni siquiera es UUID no puede existir; además Postgres daría error al compararlo.
    if (!uuid.safeParse(categoryId).success) return notFound(reply, 'category');
    const parsed = categoryUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const category = await catalog.updateCategory(businessId, categoryId, parsed.data);
    if (!category) return notFound(reply, 'category');
    return categorySchema.parse(category);
  });

  app.delete('/categories/:categoryId', { preHandler: managers }, async (request, reply) => {
    const { businessId, categoryId } = request.params as { businessId: string; categoryId: string };
    if (!uuid.safeParse(categoryId).success) return notFound(reply, 'category');
    try {
      if (!(await catalog.deleteCategory(businessId, categoryId))) return notFound(reply, 'category');
    } catch (err) {
      if (err instanceof CategoryHasProductsError) {
        return reply.code(409).send({
          error: 'category_has_products',
          message: 'La categoría todavía tiene productos. Borralos o pasalos a otra categoría primero.',
        });
      }
      throw err;
    }
    return reply.code(204).send();
  });

  app.post('/products', { preHandler: managers }, async (request, reply) => {
    const { businessId } = request.params as { businessId: string };
    const parsed = productInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    try {
      const product = await catalog.createProduct(businessId, parsed.data);
      return reply.code(201).send(productSchema.parse(product));
    } catch (err) {
      if (err instanceof CategoryNotFoundError) return categoryFieldError(reply);
      throw err;
    }
  });

  app.patch('/products/:productId', { preHandler: managers }, async (request, reply) => {
    const { businessId, productId } = request.params as { businessId: string; productId: string };
    if (!uuid.safeParse(productId).success) return notFound(reply, 'product');
    const parsed = productUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    try {
      const product = await catalog.updateProduct(businessId, productId, parsed.data);
      if (!product) return notFound(reply, 'product');
      return productSchema.parse(product);
    } catch (err) {
      if (err instanceof CategoryNotFoundError) return categoryFieldError(reply);
      throw err;
    }
  });

  app.delete('/products/:productId', { preHandler: managers }, async (request, reply) => {
    const { businessId, productId } = request.params as { businessId: string; productId: string };
    if (!uuid.safeParse(productId).success) return notFound(reply, 'product');
    if (!(await catalog.deleteProduct(businessId, productId))) return notFound(reply, 'product');
    return reply.code(204).send();
  });
}
