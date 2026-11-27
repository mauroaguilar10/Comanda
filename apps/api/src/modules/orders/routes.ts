import {
  canChangeStatus,
  createdOrderResponseSchema,
  createOrderInputSchema,
  orderSchema,
  ordersResponseSchema,
  storeResponseSchema,
  storeSettingsSchema,
  trackingResponseSchema,
  updateOrderStatusInputSchema,
} from '@comanda/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { FileStorage } from '../../lib/storage.js';
import { validationError } from '../../lib/validation.js';
import { requireRole } from '../../plugins/auth.js';
import { limiter } from '../../plugins/rate-limit.js';
import type { BusinessService } from '../businesses/businesses.js';
import type { MembershipLookup } from '../businesses/memberships.js';
import type { CatalogService } from '../catalog/catalog.js';
import { toProductResponse } from '../catalog/present.js';
import type { OrdersService, OrderWithItems } from './orders.js';
import { priceOrder, ProductsUnavailableError } from './pricing.js';

export const STORE_LIMITS = {
  // Un cliente real manda uno o dos pedidos; esto frena a quien quiera llenar el panel de pedidos falsos.
  ordersPerIp: { max: 10, timeWindow: 10 * 60_000 },
};

const uuid = z.uuid();

const storeNotFound = (reply: FastifyReply) =>
  reply.code(404).send({ error: 'store_not_found', message: 'No encontramos esa tienda.' });

const toOrderResponse = (order: OrderWithItems) => orderSchema.parse(order);

// Tienda pública: sin sesión. Se registra con prefix '/store'.
export async function storeRoutes(
  app: FastifyInstance,
  opts: { orders: OrdersService; businesses: BusinessService; catalog: CatalogService; storage: FileStorage },
): Promise<void> {
  const { orders, businesses, catalog, storage } = opts;
  const limitOrders = limiter(app, { ...STORE_LIMITS.ordersPerIp, keyGenerator: (req) => `store-order:${req.ip}` });

  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const business = await businesses.findBySlug(slug);
    if (!business) return storeNotFound(reply);

    const [{ categories }, settings] = await Promise.all([catalog.getCatalog(business.id), orders.getSettings(business.id)]);
    return storeResponseSchema.parse({
      business,
      acceptingOrders: settings.acceptingOrders,
      // Las categorías vacías no se muestran en la tienda.
      categories: categories
        .filter((c) => c.products.length > 0)
        .map((c) => ({ ...c, products: c.products.map((p) => toProductResponse(p, storage)) })),
    });
  });

  app.post('/:slug/orders', { preHandler: limitOrders }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = createOrderInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));

    const business = await businesses.findBySlug(slug);
    if (!business) return storeNotFound(reply);
    if (!(await orders.getSettings(business.id)).acceptingOrders) {
      return reply.code(409).send({ error: 'store_closed', message: 'El local no está tomando pedidos en este momento.' });
    }

    // Precios del catálogo de ESTE local: un producto de otro local "no existe" acá.
    const { categories } = await catalog.getCatalog(business.id);
    let priced;
    try {
      priced = priceOrder(
        parsed.data.items,
        categories.flatMap((c) => c.products),
      );
    } catch (err) {
      if (err instanceof ProductsUnavailableError) {
        return reply.code(409).send({
          error: 'products_unavailable',
          message: `Ya no se puede pedir: ${err.names.join(', ')}. Sacalos del pedido y probá de nuevo.`,
          products: err.names,
        });
      }
      throw err;
    }

    const { items: _items, ...customer } = parsed.data;
    const { order, trackingToken } = await orders.createOrder(business.id, customer, priced.lines, priced.totalCents);
    return reply.code(201).send(createdOrderResponseSchema.parse({ number: order.number, trackingToken }));
  });

  // Seguimiento del pedido. El token (256 bits al azar) es la "llave": sin él no se ve nada.
  app.get('/:slug/orders/:token', async (request, reply) => {
    const { slug, token } = request.params as { slug: string; token: string };
    const [business, order] = await Promise.all([businesses.findBySlug(slug), orders.findByTrackingToken(token)]);
    // El pedido tiene que ser de esta tienda: el link de un local no sirve con el slug de otro.
    if (!business || !order || order.businessId !== business.id) {
      return reply.code(404).send({ error: 'order_not_found', message: 'No encontramos ese pedido.' });
    }
    return trackingResponseSchema.parse({ ...order, businessName: business.name });
  });
}

// Panel de pedidos del local. Se registra con prefix '/businesses/:businessId'.
export async function ordersRoutes(
  app: FastifyInstance,
  opts: { orders: OrdersService; memberships: MembershipLookup },
): Promise<void> {
  const { orders, memberships } = opts;
  const anyMember = requireRole(memberships, 'manager', 'kitchen', 'driver');
  const managers = requireRole(memberships, 'manager');

  app.get('/orders', { preHandler: anyMember }, async (request) => {
    const { businessId } = request.params as { businessId: string };
    return ordersResponseSchema.parse({ orders: (await orders.listActive(businessId)).map(toOrderResponse) });
  });

  app.patch('/orders/:orderId', { preHandler: anyMember }, async (request, reply) => {
    const { businessId, orderId } = request.params as { businessId: string; orderId: string };
    const notFound = { error: 'not_found', message: 'No existe ese pedido.' };
    if (!uuid.safeParse(orderId).success) return reply.code(404).send(notFound);
    const parsed = updateOrderStatusInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));

    const order = await orders.findById(businessId, orderId);
    if (!order) return reply.code(404).send(notFound);

    const { from, status: to } = parsed.data;
    const changed = () =>
      reply.code(409).send({ error: 'order_changed', message: 'Alguien cambió este pedido recién. Actualizá para ver cómo quedó.' });
    // La pantalla estaba desactualizada: no es falta de permiso, es que el pedido ya se movió.
    if (order.status !== from) return changed();
    if (!canChangeStatus(request.membership!.role, from, to, order.fulfillment)) {
      return reply.code(403).send({ error: 'forbidden', message: 'No podés pasar este pedido a ese estado.' });
    }
    // Y si cambió entre que lo leímos y ahora, el "where status = from" no actualiza nada.
    const updated = await orders.updateStatus(businessId, orderId, from, to);
    if (!updated) return changed();
    return reply.send({ status: updated.status });
  });

  app.get('/store-settings', { preHandler: anyMember }, async (request) => {
    const { businessId } = request.params as { businessId: string };
    return storeSettingsSchema.parse(await orders.getSettings(businessId));
  });

  // Abrir o cerrar la tienda: dueño y encargado.
  app.patch('/store-settings', { preHandler: managers }, async (request, reply) => {
    const { businessId } = request.params as { businessId: string };
    const parsed = storeSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    return storeSettingsSchema.parse(await orders.updateSettings(businessId, parsed.data));
  });
}
