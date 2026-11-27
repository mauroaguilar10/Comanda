import { fastifyCookie } from '@fastify/cookie';
import {
  clientEvents,
  joinBusinessSchema,
  serverEvents,
  SOCKET_PATH,
  trackOrderSchema,
  type OrderCreatedEvent,
  type OrderUpdatedEvent,
  type SocketAck,
} from '@comanda/shared';
import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { AuthUser, SessionService } from '../modules/auth/sessions.js';
import type { MembershipLookup } from '../modules/businesses/memberships.js';
import type { OrderEvents } from '../modules/orders/events.js';
import type { OrdersService } from '../modules/orders/orders.js';
import { SESSION_COOKIE } from './auth.js';

export interface RealtimeOptions {
  sessions: SessionService;
  memberships: MembershipLookup;
  orders: OrdersService;
  corsOrigins: string[];
}

// Salas ("rooms") de Socket.IO: un mensaje a una sala le llega a todos los que están adentro.
const businessRoom = (businessId: string) => `business:${businessId}`;
const orderRoom = (orderId: string) => `order:${orderId}`;

// Monta Socket.IO sobre el mismo servidor HTTP de Fastify (mismo puerto, path /socket.io)
// y devuelve el emisor de eventos de pedidos que usan las rutas.
export function attachRealtime(app: FastifyInstance, opts: RealtimeOptions): OrderEvents {
  const io = new Server(app.server, {
    path: SOCKET_PATH,
    // Mismo criterio que la API: solo los orígenes configurados, con cookies.
    cors: opts.corsOrigins.length ? { origin: opts.corsOrigins, credentials: true } : undefined,
  });

  // Al conectarse, leemos la cookie de sesión del handshake (el pedido HTTP inicial).
  // Sin sesión también se puede conectar: el cliente de la tienda no tiene cuenta.
  io.use(async (socket, next) => {
    try {
      const token = fastifyCookie.parse(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
      socket.data.user = token ? await opts.sessions.resolve(token) : null;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser | null;

    // El panel pide escuchar un local. Mismo chequeo que las rutas: sesión y ser miembro.
    socket.on(clientEvents.joinBusiness, async (payload: unknown, ack?: (res: SocketAck) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const parsed = joinBusinessSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: 'invalid' });
      if (!user) return reply({ ok: false, error: 'unauthorized' });
      const role = await opts.memberships.getRole(user.id, parsed.data.businessId);
      if (!role) return reply({ ok: false, error: 'forbidden' });
      await socket.join(businessRoom(parsed.data.businessId));
      reply({ ok: true });
    });

    // La página de seguimiento pide escuchar su pedido. El token es la llave, como en la ruta.
    socket.on(clientEvents.trackOrder, async (payload: unknown, ack?: (res: SocketAck) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const parsed = trackOrderSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: 'invalid' });
      const order = await opts.orders.findByTrackingToken(parsed.data.token);
      if (!order) return reply({ ok: false, error: 'not_found' });
      await socket.join(orderRoom(order.id));
      reply({ ok: true });
    });
  });

  // Al cerrar la app (Ctrl+C, tests), cerramos también las conexiones abiertas.
  app.addHook('onClose', async () => {
    await io.close();
  });

  return {
    created(order) {
      const event: OrderCreatedEvent = { orderId: order.id, number: order.number };
      io.to(businessRoom(order.businessId)).emit(serverEvents.orderCreated, event);
    },
    updated(order) {
      const event: OrderUpdatedEvent = { orderId: order.id, number: order.number, status: order.status };
      // Al panel del local y a quien sigue ese pedido.
      io.to(businessRoom(order.businessId)).to(orderRoom(order.id)).emit(serverEvents.orderUpdated, event);
    },
  };
}
