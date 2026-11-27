import { businessSchema, meResponseSchema } from '@comanda/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { SESSION_COOKIE } from '../../plugins/auth.js';
import { fakeBusinesses, fakeMemberships, fakeSessions, fakeUsers } from '../../test/fakes.js';

async function setup() {
  const users = fakeUsers();
  const sessions = fakeSessions(users.all);
  const memberships = fakeMemberships();
  const businesses = fakeBusinesses(memberships);
  const app = await buildApp({ users, sessions, memberships, businesses });

  // Crea una persona y le abre una sesión; devuelve el header de cookie listo para usar.
  async function loginAs(name: string) {
    const user = await users.create({ email: `${name.toLowerCase()}@example.com`, name, passwordHash: 'x' });
    const { token } = await sessions.create(user.id);
    return { user, headers: { cookie: `${SESSION_COOKIE}=${token}` } };
  }

  return { app, memberships, loginAs };
}

const donMario = { name: 'Pizzería Don Mario', slug: 'don-mario', phone: '2657 123456' };

describe('POST /businesses', () => {
  it('crea el negocio, deja a quien lo crea como owner y aparece en /auth/me', async () => {
    const { app, loginAs } = await setup();
    const mauro = await loginAs('Mauro');

    const res = await app.inject({ method: 'POST', url: '/businesses', headers: mauro.headers, payload: donMario });

    expect(res.statusCode).toBe(201);
    const business = businessSchema.parse(res.json());
    expect(business).toMatchObject({ name: 'Pizzería Don Mario', slug: 'don-mario', phone: '2657 123456', address: null });

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: mauro.headers });
    expect(meResponseSchema.parse(me.json()).businesses).toEqual([
      { id: business.id, name: 'Pizzería Don Mario', slug: 'don-mario', role: 'owner' },
    ]);
  });

  it('sin sesión responde 401', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'POST', url: '/businesses', payload: donMario });

    expect(res.statusCode).toBe(401);
  });

  it('responde 409 si el slug está tomado', async () => {
    const { app, loginAs } = await setup();
    const mauro = await loginAs('Mauro');
    const ana = await loginAs('Ana');
    await app.inject({ method: 'POST', url: '/businesses', headers: mauro.headers, payload: donMario });

    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: ana.headers,
      payload: { name: 'Otro', slug: 'DON-MARIO' }, // el esquema lo pasa a minúsculas
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'slug_taken' });
  });

  it('responde 400 si el slug tiene caracteres inválidos', async () => {
    const { app, loginAs, memberships } = await setup();
    const mauro = await loginAs('Mauro');

    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: mauro.headers,
      payload: { name: 'Don Mario', slug: 'don mario!' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_error' });
    expect(memberships.businesses).toHaveLength(0);
  });
});

describe('GET /businesses/:businessId', () => {
  async function withBusiness() {
    const ctx = await setup();
    const owner = await ctx.loginAs('Mauro');
    const res = await ctx.app.inject({ method: 'POST', url: '/businesses', headers: owner.headers, payload: donMario });
    return { ...ctx, owner, businessId: res.json().id as string };
  }

  it('el dueño ve los datos del negocio', async () => {
    const { app, owner, businessId } = await withBusiness();

    const res = await app.inject({ method: 'GET', url: `/businesses/${businessId}`, headers: owner.headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: businessId, slug: 'don-mario' });
    // Solo los campos públicos.
    expect(res.json()).not.toHaveProperty('createdAt');
  });

  it('un empleado (cocina) también lo ve', async () => {
    const { app, loginAs, memberships, businessId } = await withBusiness();
    const beto = await loginAs('Beto');
    memberships.entries.push({ userId: beto.user.id, businessId, role: 'kitchen' });

    const res = await app.inject({ method: 'GET', url: `/businesses/${businessId}`, headers: beto.headers });

    expect(res.statusCode).toBe(200);
  });

  it('alguien que no trabaja ahí recibe 403', async () => {
    const { app, loginAs, businessId } = await withBusiness();
    const ajeno = await loginAs('Ajeno');

    const res = await app.inject({ method: 'GET', url: `/businesses/${businessId}`, headers: ajeno.headers });

    expect(res.statusCode).toBe(403);
  });
});
