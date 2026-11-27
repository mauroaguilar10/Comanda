import { createdInvitationSchema, meResponseSchema, teamResponseSchema } from '@comanda/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { Role } from '../../db/schema.js';
import { SESSION_COOKIE } from '../../plugins/auth.js';
import { fakeMemberships, fakeSessions, fakeTeam, fakeUsers, makeBusiness } from '../../test/fakes.js';

async function setup() {
  const users = fakeUsers();
  const sessions = fakeSessions(users.all);
  const local = makeBusiness({ name: 'Pizzería Don Mario', slug: 'don-mario' });
  const memberships = fakeMemberships([], [local]);
  const team = fakeTeam(users, memberships);
  const app = await buildApp({ users, sessions, memberships, team });

  // Crea una persona (con un rol en el local, o sin ninguno) y le abre una sesión.
  async function person(name: string, role?: Role) {
    const user = await users.create({ email: `${name.toLowerCase()}@example.com`, name, passwordHash: 'x' });
    if (role) memberships.entries.push({ userId: user.id, businessId: local.id, role });
    const { token } = await sessions.create(user.id);
    return { user, headers: { cookie: `${SESSION_COOKIE}=${token}` } };
  }

  const base = `/businesses/${local.id}`;
  const invite = (headers: { cookie: string }, email: string, role: string) =>
    app.inject({ method: 'POST', url: `${base}/invitations`, headers, payload: { email, role } });

  return { app, team, memberships, local, base, person, invite };
}

describe('invitar', () => {
  it('el dueño invita y recibe el token una sola vez; en el equipo queda pendiente sin token', async () => {
    const { app, base, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');

    const res = await invite(owner.headers, '  Beto@Example.com ', 'kitchen');

    expect(res.statusCode).toBe(201);
    const created = createdInvitationSchema.parse(res.json());
    expect(created).toMatchObject({ email: 'beto@example.com', role: 'kitchen' });
    expect(created.token).toBeTruthy();

    const team = await app.inject({ method: 'GET', url: `${base}/team`, headers: owner.headers });
    const body = teamResponseSchema.parse(team.json());
    expect(body.members).toEqual([{ userId: owner.user.id, name: 'Mauro', email: 'mauro@example.com', role: 'owner' }]);
    expect(body.invitations).toHaveLength(1);
    expect(team.body).not.toContain(created.token);
  });

  it('el encargado invita a cocina pero no a otro encargado', async () => {
    const { person, invite } = await setup();
    const manager = await person('Ana', 'manager');

    expect((await invite(manager.headers, 'beto@example.com', 'kitchen')).statusCode).toBe(201);
    const res = await invite(manager.headers, 'carla@example.com', 'manager');
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('Solo el dueño puede invitar encargados.');
  });

  it('no se puede invitar como dueño (400)', async () => {
    const { person, invite } = await setup();
    const owner = await person('Mauro', 'owner');

    expect((await invite(owner.headers, 'beto@example.com', 'owner')).statusCode).toBe(400);
  });

  it('cocina no puede invitar ni ver el equipo (403)', async () => {
    const { app, base, person, invite } = await setup();
    const cook = await person('Beto', 'kitchen');

    expect((await invite(cook.headers, 'x@example.com', 'driver')).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `${base}/team`, headers: cook.headers })).statusCode).toBe(403);
  });

  it('responde 409 si la persona ya trabaja en el local', async () => {
    const { person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    await person('Beto', 'kitchen');

    const res = await invite(owner.headers, 'beto@example.com', 'driver');

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'already_member', fields: { email: ['Esa persona ya trabaja en el local.'] } });
  });

  it('invitar de nuevo al mismo email invalida el link anterior', async () => {
    const { app, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const first = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json().token;
    await invite(owner.headers, 'beto@example.com', 'driver');

    expect((await app.inject({ method: 'GET', url: `/invitations/${first}` })).statusCode).toBe(404);
  });

  it('se puede revocar una invitación pendiente', async () => {
    const { app, base, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const created = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json();

    const res = await app.inject({ method: 'DELETE', url: `${base}/invitations/${created.id}`, headers: owner.headers });

    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/invitations/${created.token}` })).statusCode).toBe(404);
  });
});

describe('aceptar', () => {
  it('cualquiera con el link ve de qué local es, sin iniciar sesión', async () => {
    const { app, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const { token } = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json();

    const res = await app.inject({ method: 'GET', url: `/invitations/${token}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ businessName: 'Pizzería Don Mario', role: 'kitchen', email: 'beto@example.com' });
  });

  it('la persona invitada acepta y el local aparece en /auth/me con su rol', async () => {
    const { app, local, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const { token } = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json();
    const beto = await person('Beto');

    const res = await app.inject({ method: 'POST', url: `/invitations/${token}/accept`, headers: beto.headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ businessId: local.id });
    const me = meResponseSchema.parse((await app.inject({ method: 'GET', url: '/auth/me', headers: beto.headers })).json());
    expect(me.businesses).toEqual([{ id: local.id, name: 'Pizzería Don Mario', slug: 'don-mario', role: 'kitchen' }]);
  });

  it('el link sirve una sola vez', async () => {
    const { app, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const { token } = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json();
    const beto = await person('Beto');
    await app.inject({ method: 'POST', url: `/invitations/${token}/accept`, headers: beto.headers });

    const again = await app.inject({ method: 'POST', url: `/invitations/${token}/accept`, headers: beto.headers });

    expect(again.statusCode).toBe(404);
  });

  it('otra persona logueada no puede usar el link (403)', async () => {
    const { app, memberships, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const { token } = (await invite(owner.headers, 'beto@example.com', 'manager')).json();
    const intrusa = await person('Intrusa');

    const res = await app.inject({ method: 'POST', url: `/invitations/${token}/accept`, headers: intrusa.headers });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('beto@example.com');
    expect(memberships.entries.some((e) => e.userId === intrusa.user.id)).toBe(false);
  });

  it('una invitación vencida no sirve', async () => {
    const { app, team, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const { token } = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json();
    team.invitations[0]!.expiresAt = new Date(Date.now() - 1000);
    const beto = await person('Beto');

    expect((await app.inject({ method: 'GET', url: `/invitations/${token}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/invitations/${token}/accept`, headers: beto.headers })).statusCode).toBe(404);
  });

  it('aceptar requiere iniciar sesión (401)', async () => {
    const { app, person, invite } = await setup();
    const owner = await person('Mauro', 'owner');
    const { token } = (await invite(owner.headers, 'beto@example.com', 'kitchen')).json();

    expect((await app.inject({ method: 'POST', url: `/invitations/${token}/accept` })).statusCode).toBe(401);
  });
});

describe('sacar a alguien del equipo', () => {
  it('el dueño saca a un empleado y este pierde el acceso al instante', async () => {
    const { app, base, person } = await setup();
    const owner = await person('Mauro', 'owner');
    const beto = await person('Beto', 'kitchen');

    const res = await app.inject({ method: 'DELETE', url: `${base}/members/${beto.user.id}`, headers: owner.headers });

    expect(res.statusCode).toBe(204);
    // requireRole consulta la membresía en cada pedido: no hace falta cerrarle la sesión.
    const access = await app.inject({ method: 'GET', url: `${base}/team`, headers: beto.headers });
    expect(access.statusCode).toBe(403);
  });

  it('el encargado no puede sacar a nadie (403)', async () => {
    const { app, base, person } = await setup();
    const manager = await person('Ana', 'manager');
    const beto = await person('Beto', 'kitchen');

    const res = await app.inject({ method: 'DELETE', url: `${base}/members/${beto.user.id}`, headers: manager.headers });

    expect(res.statusCode).toBe(403);
  });

  it('no se puede sacar al dueño (409)', async () => {
    const { app, base, person } = await setup();
    const owner = await person('Mauro', 'owner');

    const res = await app.inject({ method: 'DELETE', url: `${base}/members/${owner.user.id}`, headers: owner.headers });

    expect(res.statusCode).toBe(409);
  });
});
