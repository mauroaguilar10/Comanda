import { clientEvents, serverEvents, SOCKET_PATH, type SocketAck } from '@comanda/shared';
import type { FastifyInstance } from 'fastify';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { Role } from '../db/schema.js';
import {
  fakeBusinesses,
  fakeCatalog,
  fakeMemberships,
  fakeOrders,
  fakeSessions,
  fakeStorage,
  fakeUsers,
  makeBusiness,
} from '../test/fakes.js';
import { SESSION_COOKIE } from './auth.js';

// Estos tests levantan el servidor de verdad (en un puerto libre) porque Socket.IO
// necesita una conexión real. Igual no hace falta base de datos: usan los fakes.
let app: FastifyInstance | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  await app?.close();
  app = undefined;
});

async function setup() {
  const users = fakeUsers();
  const sessions = fakeSessions(users.all);
  const local = makeBusiness({ name: 'Don Mario', slug: 'don-mario' });
  const otro = makeBusiness({ name: 'Otro', slug: 'otro' });
  const memberships = fakeMemberships([], [local, otro]);
  const catalog = fakeCatalog();
  const orders = fakeOrders();
  app = await buildApp({
    users,
    sessions,
    memberships,
    businesses: fakeBusinesses(memberships),
    catalog,
    orders,
    storage: fakeStorage(),
    realtime: true,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as { port: number };

  const cat = await catalog.createCategory(local.id, { name: 'Pizzas' });
  const muzza = await catalog.createProduct(local.id, { categoryId: cat.id, name: 'Muzza', priceCents: 100, available: true });

  // Una persona con rol en un local, y su cookie de sesión.
  async function staff(role: Role, businessId = local.id) {
    const user = await users.create({ email: `${role}-${businessId}@example.com`, name: role, passwordHash: 'x' });
    memberships.entries.push({ userId: user.id, businessId, role });
    const { token } = await sessions.create(user.id);
    return `${SESSION_COOKIE}=${token}`;
  }

  // Abre una conexión de Socket.IO, con o sin cookie.
  async function socket(cookie?: string) {
    const s = connect(`http://127.0.0.1:${port}`, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: cookie ? { cookie } : {},
    });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
    });
    return s;
  }

  const placeOrder = () =>
    app!.inject({
      method: 'POST',
      url: '/store/don-mario/orders',
      payload: {
        items: [{ productId: muzza.id, quantity: 1 }],
        customerName: 'Carla',
        customerPhone: '2657 123456',
        fulfillment: 'takeaway',
        paymentMethod: 'cash',
      },
    });

  return { local, otro, orders, staff, socket, placeOrder };
}

const join = (s: Socket, businessId: string) => s.emitWithAck(clientEvents.joinBusiness, { businessId }) as Promise<SocketAck>;

// Espera un evento; si no llega en el tiempo dado, devuelve null.
function next(s: Socket, event: string, ms = 1500): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    s.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('tiempo real: panel del local', () => {
  it('el panel recibe el pedido nuevo al instante', async () => {
    const { local, staff, socket, placeOrder } = await setup();
    const panel = await socket(await staff('kitchen'));
    expect(await join(panel, local.id)).toEqual({ ok: true });

    const created = next(panel, serverEvents.orderCreated);
    await placeOrder();

    expect(await created).toMatchObject({ number: 1 });
  });

  it('sin sesión no se puede escuchar un local', async () => {
    const { local, socket } = await setup();
    const anon = await socket();

    expect(await join(anon, local.id)).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('alguien de otro local no puede escucharlo ni recibe sus pedidos', async () => {
    const { local, otro, staff, socket, placeOrder } = await setup();
    const ajeno = await socket(await staff('owner', otro.id));

    expect(await join(ajeno, local.id)).toEqual({ ok: false, error: 'forbidden' });
    const created = next(ajeno, serverEvents.orderCreated, 500);
    await placeOrder();
    expect(await created).toBeNull();
  });
});

describe('tiempo real: seguimiento del cliente', () => {
  it('el cliente recibe el cambio de estado de SU pedido, y solo el suyo', async () => {
    const { local, orders, staff, socket, placeOrder } = await setup();
    const { trackingToken: mine } = (await placeOrder()).json();
    const { trackingToken: other } = (await placeOrder()).json();
    const cliente = await socket();
    const otroCliente = await socket();
    expect(await cliente.emitWithAck(clientEvents.trackOrder, { token: mine })).toEqual({ ok: true });
    await otroCliente.emitWithAck(clientEvents.trackOrder, { token: other });

    const mineUpdated = next(cliente, serverEvents.orderUpdated);
    const otherUpdated = next(otroCliente, serverEvents.orderUpdated, 500);
    const order = orders.orders.find((o) => o.token === mine)!;
    const cookie = await staff('manager');
    await app!.inject({
      method: 'PATCH',
      url: `/businesses/${local.id}/orders/${order.id}`,
      headers: { cookie },
      payload: { from: 'received', status: 'preparing' },
    });

    expect(await mineUpdated).toMatchObject({ number: order.number, status: 'preparing' });
    expect(await otherUpdated).toBeNull();
  });

  it('con un token inventado no se puede seguir nada', async () => {
    const { socket } = await setup();
    const cliente = await socket();

    expect(await cliente.emitWithAck(clientEvents.trackOrder, { token: 'inventado' })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('el evento no lleva datos personales', async () => {
    const { local, staff, socket, placeOrder } = await setup();
    const panel = await socket(await staff('kitchen'));
    await join(panel, local.id);

    const created = next(panel, serverEvents.orderCreated);
    await placeOrder();

    expect(JSON.stringify(await created)).not.toMatch(/Carla|2657/);
  });
});
