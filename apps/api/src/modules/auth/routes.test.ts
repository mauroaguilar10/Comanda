import { meResponseSchema } from '@comanda/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../lib/password.js';
import { SESSION_COOKIE } from '../../plugins/auth.js';
import { fakeMemberships, fakeSessions, fakeUsers, makeBusiness } from '../../test/fakes.js';

const PASSWORD = 'una-clave-larga';

// Arma la app con los fakes. Los tres comparten datos:
// sessions resuelve contra users.all, así ve a los que se registran en el test.
async function setup() {
  const users = fakeUsers();
  const sessions = fakeSessions(users.all);
  const memberships = fakeMemberships();
  const app = await buildApp({ users, sessions, memberships });
  return { app, users, sessions, memberships };
}

type App = Awaited<ReturnType<typeof setup>>['app'];

const register = (app: App, body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/auth/register', payload: body });

const login = (app: App, body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/auth/login', payload: body });

const sessionCookie = (res: { cookies: { name: string; value: string; httpOnly?: boolean }[] }) =>
  res.cookies.find((c) => c.name === SESSION_COOKIE);

const withCookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

// Crea un usuario directo en el fake (sin pasar por la ruta) para probar el login.
async function seedUser(users: ReturnType<typeof fakeUsers>) {
  return users.create({ email: 'ana@example.com', name: 'Ana', passwordHash: await hashPassword(PASSWORD) });
}

describe('POST /auth/register', () => {
  it('crea el usuario, devuelve 201 con MeResponse y pone la cookie de sesión', async () => {
    const { app, users } = await setup();

    const res = await register(app, { name: 'Mauro', email: 'mauro@example.com', password: PASSWORD });

    expect(res.statusCode).toBe(201);
    const body = meResponseSchema.parse(res.json());
    expect(body).toEqual({
      user: { id: users.all[0]!.id, email: 'mauro@example.com', name: 'Mauro' },
      businesses: [],
    });

    const cookie = sessionCookie(res);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);

    // La contraseña se guardó hasheada, no en texto plano.
    expect(users.all[0]!.passwordHash).not.toContain(PASSWORD);
  });

  it('guarda el email en minúsculas', async () => {
    const { app, users } = await setup();

    const res = await register(app, { name: 'Mauro', email: '  Mauro@Example.COM ', password: PASSWORD });

    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe('mauro@example.com');
    expect(users.all[0]!.email).toBe('mauro@example.com');
  });

  it('responde 409 si el email ya está registrado', async () => {
    const { app, users } = await setup();
    await register(app, { name: 'Mauro', email: 'mauro@example.com', password: PASSWORD });

    // Mismo email con otras mayúsculas: también cuenta como repetido.
    const res = await register(app, { name: 'Otro', email: 'MAURO@example.com', password: PASSWORD });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'email_taken' });
    expect(users.all).toHaveLength(1);
  });

  it('responde 400 si la contraseña tiene menos de 10 caracteres', async () => {
    const { app, users } = await setup();

    const res = await register(app, { name: 'Mauro', email: 'mauro@example.com', password: 'corta' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_error', fields: { password: ['Mínimo 10 caracteres'] } });
    expect(sessionCookie(res)).toBeUndefined();
    expect(users.all).toHaveLength(0);
  });

  it('nunca devuelve passwordHash', async () => {
    const { app } = await setup();

    const res = await register(app, { name: 'Mauro', email: 'mauro@example.com', password: PASSWORD });

    expect(res.body).not.toContain('passwordHash');
    expect(res.body).not.toContain('$argon2');
  });
});

describe('POST /auth/login', () => {
  it('con email y contraseña correctos devuelve 200 y pone la cookie', async () => {
    const { app, users } = await setup();
    const ana = await seedUser(users);

    const res = await login(app, { email: 'ANA@example.com', password: PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(meResponseSchema.parse(res.json()).user).toEqual({ id: ana.id, email: ana.email, name: 'Ana' });
    expect(sessionCookie(res)?.value).toBeTruthy();
    expect(res.body).not.toContain('passwordHash');
  });

  it('con contraseña incorrecta responde 401', async () => {
    const { app, users } = await setup();
    await seedUser(users);

    const res = await login(app, { email: 'ana@example.com', password: 'otra-clave-larga' });

    expect(res.statusCode).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('con un email que no existe responde el mismo 401 y el mismo mensaje', async () => {
    const { app, users } = await setup();
    await seedUser(users);

    const wrongPassword = await login(app, { email: 'ana@example.com', password: 'otra-clave-larga' });
    const unknownEmail = await login(app, { email: 'nadie@example.com', password: PASSWORD });

    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });
});

describe('POST /auth/logout', () => {
  it('revoca la sesión: después /auth/me responde 401', async () => {
    const { app } = await setup();
    const reg = await register(app, { name: 'Mauro', email: 'mauro@example.com', password: PASSWORD });
    const token = sessionCookie(reg)!.value;

    const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: withCookie(token) });

    expect(res.statusCode).toBe(204);
    // La respuesta le pide al navegador que borre la cookie (con fecha de vencimiento pasada).
    expect(sessionCookie(res)?.value).toBe('');

    // Aunque alguien se haya guardado el token, ya no sirve.
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: withCookie(token) });
    expect(me.statusCode).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('sin cookie responde 401', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(res.statusCode).toBe(401);
  });

  it('con sesión devuelve el usuario y sus negocios con el rol', async () => {
    const { app, users, memberships } = await setup();
    const reg = await register(app, { name: 'Mauro', email: 'mauro@example.com', password: PASSWORD });
    const userId = users.all[0]!.id;

    const pizzeria = makeBusiness({ name: 'Pizzería Don Mario', slug: 'don-mario' });
    const rotiseria = makeBusiness({ name: 'Rotisería La Esquina', slug: 'la-esquina' });
    const ajeno = makeBusiness({ name: 'Bar Ajeno', slug: 'bar-ajeno' });
    memberships.businesses.push(pizzeria, rotiseria, ajeno);
    memberships.entries.push(
      { userId, businessId: pizzeria.id, role: 'owner' },
      { userId, businessId: rotiseria.id, role: 'kitchen' },
      { userId: 'otra-persona', businessId: ajeno.id, role: 'owner' },
    );

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: withCookie(sessionCookie(reg)!.value) });

    expect(res.statusCode).toBe(200);
    expect(meResponseSchema.parse(res.json())).toEqual({
      user: { id: userId, email: 'mauro@example.com', name: 'Mauro' },
      businesses: [
        { id: pizzeria.id, name: 'Pizzería Don Mario', slug: 'don-mario', role: 'owner' },
        { id: rotiseria.id, name: 'Rotisería La Esquina', slug: 'la-esquina', role: 'kitchen' },
      ],
    });
  });
});
