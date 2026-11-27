import {
  createdOrderResponseSchema,
  ordersResponseSchema,
  storeResponseSchema,
  trackingResponseSchema,
} from '@comanda/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { Role } from '../../db/schema.js';
import { SESSION_COOKIE } from '../../plugins/auth.js';
import {
  fakeBusinesses,
  fakeCatalog,
  fakeMemberships,
  fakeOrders,
  fakeSessions,
  fakeStorage,
  fakeUsers,
  makeBusiness,
} from '../../test/fakes.js';
import { STORE_LIMITS } from './routes.js';

// Un local con menú cargado ("Don Mario") y otro local aparte.
async function setup() {
  const users = fakeUsers();
  const sessions = fakeSessions(users.all);
  const donMario = makeBusiness({ name: 'Pizzería Don Mario', slug: 'don-mario', phone: '2657 111111' });
  const otro = makeBusiness({ name: 'Otro', slug: 'otro' });
  const memberships = fakeMemberships([], [donMario, otro]);
  const businesses = fakeBusinesses(memberships);
  const catalog = fakeCatalog();
  const orders = fakeOrders();
  const storage = fakeStorage();
  const app = await buildApp({ users, sessions, memberships, businesses, catalog, orders, storage });

  const pizzas = await catalog.createCategory(donMario.id, { name: 'Pizzas' });
  await catalog.createCategory(donMario.id, { name: 'Vacía' });
  const muzza = await catalog.createProduct(donMario.id, {
    categoryId: pizzas.id,
    name: 'Muzzarella',
    priceCents: 900000,
    available: true,
  });
  const napo = await catalog.createProduct(donMario.id, {
    categoryId: pizzas.id,
    name: 'Napolitana',
    priceCents: 1050000,
    available: true,
  });
  const pausada = await catalog.createProduct(donMario.id, {
    categoryId: pizzas.id,
    name: 'Fugazzeta',
    priceCents: 1000000,
    available: false,
  });
  const otraCat = await catalog.createCategory(otro.id, { name: 'X' });
  const ajeno = await catalog.createProduct(otro.id, { categoryId: otraCat.id, name: 'Ajeno', priceCents: 1, available: true });

  // Una persona por rol: la primera vez la crea, después reutiliza su sesión.
  const people = new Map<Role, { cookie: string }>();
  async function as(role: Role) {
    const existing = people.get(role);
    if (existing) return existing;
    const user = await users.create({ email: `${role}@example.com`, name: role, passwordHash: 'x' });
    memberships.entries.push({ userId: user.id, businessId: donMario.id, role });
    const { token } = await sessions.create(user.id);
    const headers = { cookie: `${SESSION_COOKIE}=${token}` };
    people.set(role, headers);
    return headers;
  }

  const order = (payload: object, ip = '10.0.0.1') =>
    app.inject({ method: 'POST', url: '/store/don-mario/orders', payload, remoteAddress: ip });

  const takeaway = {
    items: [
      { productId: muzza.id, quantity: 2 },
      { productId: napo.id, quantity: 1 },
    ],
    customerName: 'Beto',
    customerPhone: '2657 12-3456',
    fulfillment: 'takeaway',
    paymentMethod: 'cash',
  };

  return { app, orders, catalog, donMario, muzza, napo, pausada, ajeno, as, order, takeaway };
}

describe('tienda pública', () => {
  it('muestra el local y su menú sin iniciar sesión, sin categorías vacías', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/store/don-mario' });

    expect(res.statusCode).toBe(200);
    const store = storeResponseSchema.parse(res.json());
    expect(store.business).toEqual({ name: 'Pizzería Don Mario', slug: 'don-mario', phone: '2657 111111', address: null });
    expect(store.acceptingOrders).toBe(true);
    expect(store.categories.map((c) => c.name)).toEqual(['Pizzas']);
    expect(store.categories[0]!.products.map((p) => [p.name, p.available])).toEqual([
      ['Muzzarella', true],
      ['Napolitana', true],
      ['Fugazzeta', false],
    ]);
  });

  it('una tienda que no existe da 404', async () => {
    const { app } = await setup();

    expect((await app.inject({ method: 'GET', url: '/store/no-existe' })).statusCode).toBe(404);
  });
});

describe('hacer un pedido', () => {
  it('crea el pedido con los precios del catálogo y devuelve número y token', async () => {
    const { order, orders, takeaway } = await setup();

    const res = await order(takeaway);

    expect(res.statusCode).toBe(201);
    const created = createdOrderResponseSchema.parse(res.json());
    expect(created.number).toBe(1);
    expect(created.trackingToken).toBeTruthy();
    const saved = orders.orders[0]!;
    expect(saved.totalCents).toBe(2 * 900000 + 1050000);
    expect(saved.items.map((i) => [i.name, i.unitPriceCents, i.quantity])).toEqual([
      ['Muzzarella', 900000, 2],
      ['Napolitana', 1050000, 1],
    ]);
  });

  it('ignora precios mandados por el navegador', async () => {
    const { order, orders, takeaway, muzza } = await setup();

    await order({ ...takeaway, items: [{ productId: muzza.id, quantity: 1, unitPriceCents: 1 }], totalCents: 1 });

    expect(orders.orders[0]!.totalCents).toBe(900000);
  });

  it('los números son correlativos por local', async () => {
    const { order, takeaway } = await setup();

    const numbers = [];
    for (let i = 0; i < 3; i++) numbers.push((await order(takeaway)).json().number);

    expect(numbers).toEqual([1, 2, 3]);
  });

  it('el envío necesita dirección (400)', async () => {
    const { order, takeaway } = await setup();

    const res = await order({ ...takeaway, fulfillment: 'delivery' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ fields: { address: ['Poné la dirección de entrega'] } });
  });

  it('un producto pausado no se puede pedir (409, dice cuál)', async () => {
    const { order, orders, takeaway, pausada } = await setup();

    const res = await order({ ...takeaway, items: [...takeaway.items, { productId: pausada.id, quantity: 1 }] });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'products_unavailable', products: ['Fugazzeta'] });
    expect(orders.orders).toHaveLength(0);
  });

  it('un producto de otro local no se puede pedir acá', async () => {
    const { order, orders, takeaway, ajeno } = await setup();

    const res = await order({ ...takeaway, items: [{ productId: ajeno.id, quantity: 1 }] });

    expect(res.statusCode).toBe(409);
    expect(orders.orders).toHaveLength(0);
  });

  it('con la tienda cerrada no se puede pedir (409)', async () => {
    const { order, orders, donMario, takeaway } = await setup();
    await orders.updateSettings(donMario.id, { acceptingOrders: false });

    const res = await order(takeaway);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'store_closed' });
  });

  it('limita los pedidos por IP', async () => {
    const { order, takeaway } = await setup();

    for (let i = 0; i < STORE_LIMITS.ordersPerIp.max; i++) expect((await order(takeaway)).statusCode).toBe(201);

    expect((await order(takeaway)).statusCode).toBe(429);
    expect((await order(takeaway, '10.0.0.2')).statusCode).toBe(201);
  });
});

describe('seguimiento', () => {
  it('con el token se ve el estado, sin teléfono ni dirección', async () => {
    const { app, order, takeaway } = await setup();
    const { trackingToken } = (await order({ ...takeaway, fulfillment: 'delivery', address: 'Pedernera 123' })).json();

    const res = await app.inject({ method: 'GET', url: `/store/don-mario/orders/${trackingToken}` });

    expect(res.statusCode).toBe(200);
    expect(trackingResponseSchema.parse(res.json())).toMatchObject({
      businessName: 'Pizzería Don Mario',
      number: 1,
      status: 'received',
      fulfillment: 'delivery',
    });
    expect(res.body).not.toContain('2657');
    expect(res.body).not.toContain('Pedernera');
  });

  it('un token inventado o de otra tienda da 404', async () => {
    const { app, order, takeaway } = await setup();
    const { trackingToken } = (await order(takeaway)).json();

    expect((await app.inject({ method: 'GET', url: '/store/don-mario/orders/inventado' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/store/otro/orders/${trackingToken}` })).statusCode).toBe(404);
  });
});

describe('panel de pedidos', () => {
  async function withOrder(fulfillment: 'takeaway' | 'delivery' = 'delivery') {
    const ctx = await setup();
    await ctx.order({ ...ctx.takeaway, fulfillment, address: fulfillment === 'delivery' ? 'Pedernera 123' : undefined });
    const id = ctx.orders.orders[0]!.id;
    // `from` por defecto es el estado actual (una pantalla al día); se puede forzar otro.
    const move = async (role: Role, status: string, from = ctx.orders.orders[0]!.status) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/businesses/${ctx.donMario.id}/orders/${id}`,
        headers: await ctx.as(role),
        payload: { from, status },
      });
    return { ...ctx, id, move };
  }

  it('cualquier miembro ve los pedidos en curso con sus ítems', async () => {
    const { app, donMario, as } = await withOrder();

    const res = await app.inject({ method: 'GET', url: `/businesses/${donMario.id}/orders`, headers: await as('kitchen') });

    expect(res.statusCode).toBe(200);
    const { orders } = ordersResponseSchema.parse(res.json());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ number: 1, customerPhone: '2657 12-3456', address: 'Pedernera 123' });
    expect(orders[0]!.items).toHaveLength(2);
  });

  it('el recorrido completo de un envío, cada rol en su parte', async () => {
    const { move, orders } = await withOrder('delivery');

    expect((await move('kitchen', 'preparing')).statusCode).toBe(200);
    expect((await move('kitchen', 'ready')).statusCode).toBe(200);
    expect((await move('driver', 'on_the_way')).statusCode).toBe(200);
    expect((await move('driver', 'delivered')).statusCode).toBe(200);
    expect(orders.orders[0]!.status).toBe('delivered');
  });

  it('cocina no puede cancelar ni saltar estados (403)', async () => {
    const { move, orders } = await withOrder();

    expect((await move('kitchen', 'cancelled')).statusCode).toBe(403);
    expect((await move('kitchen', 'ready')).statusCode).toBe(403);
    expect(orders.orders[0]!.status).toBe('received');
  });

  it('el encargado cancela', async () => {
    const { move, orders } = await withOrder();

    expect((await move('manager', 'cancelled')).statusCode).toBe(200);
    expect(orders.orders[0]!.status).toBe('cancelled');
  });

  it('si dos personas mueven el mismo pedido a la vez, la segunda recibe 409 (no 403)', async () => {
    const { move, orders } = await withOrder();

    // Las dos pantallas muestran "recibido".
    const [a, b] = await Promise.all([move('kitchen', 'preparing', 'received'), move('manager', 'cancelled', 'received')]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(b.json().error ?? a.json().error).toBe('order_changed');
    expect(['preparing', 'cancelled']).toContain(orders.orders[0]!.status);
  });

  it('alguien de afuera no ve los pedidos (401 sin sesión)', async () => {
    const { app, donMario } = await withOrder();

    expect((await app.inject({ method: 'GET', url: `/businesses/${donMario.id}/orders` })).statusCode).toBe(401);
  });
});

describe('abrir y cerrar la tienda', () => {
  it('el encargado cierra la tienda; cocina no puede', async () => {
    const { app, donMario, as } = await setup();
    const url = `/businesses/${donMario.id}/store-settings`;

    const kitchen = await app.inject({ method: 'PATCH', url, headers: await as('kitchen'), payload: { acceptingOrders: false } });
    const manager = await app.inject({ method: 'PATCH', url, headers: await as('manager'), payload: { acceptingOrders: false } });

    expect(kitchen.statusCode).toBe(403);
    expect(manager.json()).toEqual({ acceptingOrders: false });
    const store = await app.inject({ method: 'GET', url: '/store/don-mario' });
    expect(store.json().acceptingOrders).toBe(false);
  });
});
