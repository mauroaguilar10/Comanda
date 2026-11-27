import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { fakeMemberships, fakeSessions } from '../test/fakes.js';
import { requireAuth, requireRole, SESSION_COOKIE } from './auth.js';

const ana = { id: 'u-ana', email: 'ana@example.com', name: 'Ana' };
const beto = { id: 'u-beto', email: 'beto@example.com', name: 'Beto' };
const LOCAL = 'b-local';

// Arma una app con dos rutas de prueba protegidas por las guardias.
async function setup() {
  const sessions = fakeSessions([ana, beto]);
  const memberships = fakeMemberships([
    { userId: ana.id, businessId: LOCAL, role: 'owner' },
    { userId: beto.id, businessId: LOCAL, role: 'kitchen' },
  ]);
  const app = await buildApp({ sessions, memberships });

  app.get('/private', { preHandler: requireAuth }, async (req) => ({ user: req.user }));
  app.get(
    '/businesses/:businessId/menu',
    { preHandler: requireRole(memberships, 'manager') },
    async (req) => ({ membership: req.membership }),
  );

  const anaToken = (await sessions.create(ana.id)).token;
  const betoToken = (await sessions.create(beto.id)).token;
  return { app, anaToken, betoToken };
}

const withCookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

describe('requireAuth', () => {
  it('rechaza con 401 sin cookie', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/private' });
    expect(res.statusCode).toBe(401);
  });

  it('rechaza con 401 con un token que no existe', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/private', headers: withCookie('inventado') });
    expect(res.statusCode).toBe(401);
  });

  it('deja pasar con sesión válida y carga request.user', async () => {
    const { app, anaToken } = await setup();
    const res = await app.inject({ method: 'GET', url: '/private', headers: withCookie(anaToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: ana });
  });
});

describe('requireRole', () => {
  it('el dueño pasa aunque la ruta pida otro rol', async () => {
    const { app, anaToken } = await setup();
    const res = await app.inject({ method: 'GET', url: `/businesses/${LOCAL}/menu`, headers: withCookie(anaToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ membership: { businessId: LOCAL, role: 'owner' } });
  });

  it('cocina no puede entrar a una ruta de encargado', async () => {
    const { app, betoToken } = await setup();
    const res = await app.inject({ method: 'GET', url: `/businesses/${LOCAL}/menu`, headers: withCookie(betoToken) });
    expect(res.statusCode).toBe(403);
  });

  it('nadie entra a un negocio donde no trabaja', async () => {
    const { app, anaToken } = await setup();
    const res = await app.inject({ method: 'GET', url: '/businesses/otro-local/menu', headers: withCookie(anaToken) });
    expect(res.statusCode).toBe(403);
  });

  it('sin sesión responde 401, no 403', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: `/businesses/${LOCAL}/menu` });
    expect(res.statusCode).toBe(401);
  });
});
