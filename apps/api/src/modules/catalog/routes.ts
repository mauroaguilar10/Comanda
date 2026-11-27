import {
  catalogResponseSchema,
  categoryInputSchema,
  categorySchema,
  categoryUpdateSchema,
  productInputSchema,
  productUpdateSchema,
} from '@comanda/shared';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES } from '@comanda/shared';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Product } from '../../db/schema.js';
import { detectImage, IMAGE_TYPES } from '../../lib/image.js';
import type { FileStorage } from '../../lib/storage.js';
import { generateToken } from '../../lib/tokens.js';
import { validationError } from '../../lib/validation.js';
import { requireRole } from '../../plugins/auth.js';
import type { MembershipLookup } from '../businesses/memberships.js';
import { toProductResponse } from './present.js';
import { CategoryHasProductsError, CategoryNotFoundError, type CatalogService } from './catalog.js';

export interface CatalogRoutesOptions {
  catalog: CatalogService;
  memberships: MembershipLookup;
  storage: FileStorage;
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
  const { catalog, memberships, storage } = opts;

  const toResponse = (product: Product) => toProductResponse(product, storage);

  // Borrar un archivo viejo no tiene que romper el pedido: si falla, queda huérfano
  // en el almacenamiento (ocupa lugar, pero no se ve) y lo dejamos anotado en el log.
  async function deleteFile(key: string | null) {
    if (!key) return;
    try {
      await storage.delete(key);
    } catch (err) {
      app.log.warn({ err, key }, 'No se pudo borrar una foto vieja');
    }
  }

  // Las fotos llegan como el cuerpo crudo del pedido (no JSON). Este parser solo existe
  // dentro de este plugin y corta antes de leer más de MAX_IMAGE_BYTES.
  app.addContentTypeParser([...IMAGE_CONTENT_TYPES], { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  // Errores de Fastify al leer el cuerpo, con nuestro formato y en castellano.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'image_too_large', message: 'La foto es demasiado pesada (máximo 2 MB).' });
    }
    if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.code(415).send({ error: 'unsupported_image', message: 'La foto tiene que ser JPG, PNG o WebP.' });
    }
    return reply.send(error);
  });

  // Ver el menú: cualquiera que trabaje en el local (cocina necesita saber qué se vende).
  const anyMember = requireRole(memberships, 'manager', 'kitchen', 'driver');
  // Cambiar el menú: dueño (pasa siempre) y encargado.
  const managers = requireRole(memberships, 'manager');

  app.get('/catalog', { preHandler: anyMember }, async (request) => {
    const { businessId } = request.params as { businessId: string };
    // parse deja solo los campos públicos (saca businessId, fechas, etc.).
    const { categories } = await catalog.getCatalog(businessId);
    return catalogResponseSchema.parse({
      categories: categories.map((c) => ({ ...c, products: c.products.map(toResponse) })),
    });
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
      return reply.code(201).send(toResponse(product));
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
      return toResponse(product);
    } catch (err) {
      if (err instanceof CategoryNotFoundError) return categoryFieldError(reply);
      throw err;
    }
  });

  app.delete('/products/:productId', { preHandler: managers }, async (request, reply) => {
    const { businessId, productId } = request.params as { businessId: string; productId: string };
    if (!uuid.safeParse(productId).success) return notFound(reply, 'product');
    const deleted = await catalog.deleteProduct(businessId, productId);
    if (!deleted) return notFound(reply, 'product');
    await deleteFile(deleted.imageKey);
    return reply.code(204).send();
  });

  // Subir o reemplazar la foto. El cuerpo es la imagen tal cual (Content-Type: image/webp, etc.).
  app.put('/products/:productId/image', { preHandler: managers }, async (request, reply) => {
    const { businessId, productId } = request.params as { businessId: string; productId: string };
    if (!uuid.safeParse(productId).success) return notFound(reply, 'product');
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(415).send({ error: 'unsupported_image', message: 'La foto tiene que ser JPG, PNG o WebP.' });
    }
    const type = detectImage(request.body, request.headers['content-type'] ?? '');
    if (!type) {
      return reply.code(415).send({ error: 'unsupported_image', message: 'El archivo no es una foto JPG, PNG o WebP válida.' });
    }

    // Una clave nueva por foto (con una parte al azar): así se puede guardar en caché
    // para siempre y, al cambiarla, el navegador pide la nueva sin mostrar la vieja.
    const key = `products/${businessId}/${productId}-${generateToken().slice(0, 16)}.${IMAGE_TYPES[type].ext}`;
    await storage.put(key, request.body, type);
    const result = await catalog.setImage(businessId, productId, key);
    if (!result) {
      // El producto no existe (o es de otro local): no dejamos el archivo tirado.
      await deleteFile(key);
      return notFound(reply, 'product');
    }
    await deleteFile(result.previousKey);
    return toResponse(result.product);
  });

  app.delete('/products/:productId/image', { preHandler: managers }, async (request, reply) => {
    const { businessId, productId } = request.params as { businessId: string; productId: string };
    if (!uuid.safeParse(productId).success) return notFound(reply, 'product');
    const result = await catalog.setImage(businessId, productId, null);
    if (!result) return notFound(reply, 'product');
    await deleteFile(result.previousKey);
    return toResponse(result.product);
  });
}
