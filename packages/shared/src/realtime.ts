import { z } from 'zod';
import { orderStatusSchema } from './orders.js';

// Contrato del tiempo real (Socket.IO). Los eventos solo avisan "algo cambió" con lo mínimo
// para mostrar un aviso; los datos completos se piden por la API de siempre, que chequea permisos.

// Path de Socket.IO en la API (en desarrollo, Vite lo pasa como /api/socket.io).
export const SOCKET_PATH = '/socket.io';

// Del cliente al servidor (con respuesta: { ok } o { ok: false, error }).
export const clientEvents = {
  // El panel de un local: hace falta sesión y trabajar ahí.
  joinBusiness: 'business:join',
  // El seguimiento de un pedido: hace falta el token del link.
  trackOrder: 'order:track',
} as const;

// Del servidor al cliente.
export const serverEvents = {
  orderCreated: 'order:created',
  orderUpdated: 'order:updated',
} as const;

export const joinBusinessSchema = z.object({ businessId: z.uuid() });
export const trackOrderSchema = z.object({ token: z.string().min(1).max(100) });

export const orderCreatedEventSchema = z.object({ orderId: z.uuid(), number: z.int() });
export type OrderCreatedEvent = z.infer<typeof orderCreatedEventSchema>;

export const orderUpdatedEventSchema = z.object({ orderId: z.uuid(), number: z.int(), status: orderStatusSchema });
export type OrderUpdatedEvent = z.infer<typeof orderUpdatedEventSchema>;

export type SocketAck = { ok: true } | { ok: false; error: string };
