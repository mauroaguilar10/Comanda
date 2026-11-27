import { z } from 'zod';
import type { Role } from './auth.js';
import { catalogResponseSchema } from './catalog.js';

// Contratos de la etapa 2: pedidos. Ver docs/etapa-2.md.

export const orderStatusSchema = z.enum(['received', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const fulfillmentSchema = z.enum(['takeaway', 'delivery'], 'Elegí retiro o envío');
export type Fulfillment = z.infer<typeof fulfillmentSchema>;

export const paymentMethodSchema = z.enum(['cash', 'transfer'], 'Elegí cómo vas a pagar');
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// Estados en los que el pedido todavía está "en curso" (los que muestra el panel).
export const ACTIVE_STATUSES: OrderStatus[] = ['received', 'preparing', 'ready', 'on_the_way'];

// A qué estados se puede pasar desde cada uno. El retiro en el local no pasa por "en camino".
export function nextStatuses(status: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  switch (status) {
    case 'received':
      return ['preparing', 'cancelled'];
    case 'preparing':
      return ['ready', 'cancelled'];
    case 'ready':
      return fulfillment === 'delivery' ? ['on_the_way', 'cancelled'] : ['delivered', 'cancelled'];
    case 'on_the_way':
      return ['delivered', 'cancelled'];
    default:
      return []; // entregado y cancelado son finales
  }
}

// Quién puede hacer cada cambio. Dueño y encargado, todo; cocina prepara y entrega
// los de retiro; reparto lleva los envíos. Cancelar, solo dueño y encargado.
export function canChangeStatus(role: Role, from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment): boolean {
  if (!nextStatuses(from, fulfillment).includes(to)) return false;
  if (role === 'owner' || role === 'manager') return true;
  if (to === 'cancelled') return false;
  if (role === 'kitchen') return to === 'preparing' || to === 'ready' || (to === 'delivered' && fulfillment === 'takeaway');
  if (role === 'driver') return fulfillment === 'delivery' && (to === 'on_the_way' || to === 'delivered');
  return false;
}

export const MAX_ITEM_QUANTITY = 50;
export const MAX_ORDER_LINES = 50;

// Teléfono argentino escrito como sea: "2657 12-3456", "+54 9 2657 123456".
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{6,25}$/, 'Poné un teléfono válido, por ejemplo 2657 123456');

// POST /store/:slug/orders. Solo ids y cantidades: el precio lo pone el servidor.
export const createOrderInputSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.int().min(1).max(MAX_ITEM_QUANTITY, `Máximo ${MAX_ITEM_QUANTITY} unidades por producto`),
        }),
      )
      .min(1, 'El pedido está vacío')
      .max(MAX_ORDER_LINES, 'Demasiados productos distintos'),
    customerName: z.string().trim().min(2, 'Poné tu nombre').max(80, 'Máximo 80 caracteres'),
    customerPhone: phone,
    fulfillment: fulfillmentSchema,
    address: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
    paymentMethod: paymentMethodSchema,
    notes: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  })
  // La dirección es obligatoria solo para envíos: un chequeo que mira dos campos a la vez.
  .refine((o) => o.fulfillment !== 'delivery' || (o.address && o.address.length >= 5), {
    path: ['address'],
    message: 'Poné la dirección de entrega',
  });
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export const createdOrderResponseSchema = z.object({
  number: z.int(),
  // El token del link de seguimiento: se ve una sola vez.
  trackingToken: z.string(),
});
export type CreatedOrder = z.infer<typeof createdOrderResponseSchema>;

export const orderItemSchema = z.object({
  name: z.string(),
  unitPriceCents: z.int(),
  quantity: z.int(),
});

// Un pedido como lo ve el local en el panel.
export const orderSchema = z.object({
  id: z.uuid(),
  number: z.int(),
  status: orderStatusSchema,
  fulfillment: fulfillmentSchema,
  paymentMethod: paymentMethodSchema,
  customerName: z.string(),
  customerPhone: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  totalCents: z.int(),
  createdAt: z.coerce.date(),
  items: z.array(orderItemSchema),
});
export type OrderResponse = z.infer<typeof orderSchema>;

// GET /businesses/:businessId/orders
export const ordersResponseSchema = z.object({ orders: z.array(orderSchema) });

// PATCH /businesses/:businessId/orders/:orderId
// `from` es el estado que ve la pantalla. Si el pedido ya cambió (otra persona lo movió),
// la API responde 409 en vez de aplicar el cambio sobre algo que la persona no vio.
export const updateOrderStatusInputSchema = z.object({ from: orderStatusSchema, status: orderStatusSchema });

// GET /store/:slug/orders/:token: lo que ve el cliente. Sin teléfono ni dirección:
// si el link se reenvía, no expone datos personales.
export const trackingResponseSchema = z.object({
  businessName: z.string(),
  number: z.int(),
  status: orderStatusSchema,
  fulfillment: fulfillmentSchema,
  totalCents: z.int(),
  createdAt: z.coerce.date(),
  items: z.array(orderItemSchema),
});
export type TrackingResponse = z.infer<typeof trackingResponseSchema>;

// GET /store/:slug: el local y su menú para la tienda pública.
export const storeResponseSchema = z.object({
  business: z.object({
    name: z.string(),
    slug: z.string(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  }),
  acceptingOrders: z.boolean(),
  categories: catalogResponseSchema.shape.categories,
});
export type StoreResponse = z.infer<typeof storeResponseSchema>;

// GET/PATCH /businesses/:businessId/store-settings
export const storeSettingsSchema = z.object({ acceptingOrders: z.boolean() });
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

