import { loginInputSchema, meResponseSchema, registerInputSchema, type MeResponse } from '@comanda/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { validationError } from '../../lib/validation.js';
import { requireAuth, SESSION_COOKIE } from '../../plugins/auth.js';
import { limiter } from '../../plugins/rate-limit.js';
import type { MembershipLookup } from '../businesses/memberships.js';
import type { AuthUser, SessionService } from './sessions.js';
import { EmailTakenError, type UserRepository } from './users.js';

export interface AuthRoutesOptions {
  users: UserRepository;
  sessions: SessionService;
  memberships: MembershipLookup;
}

// Límites de intentos. Exportados para que los tests usen los mismos números.
export const AUTH_LIMITS = {
  // Por IP: frena a quien prueba muchas cuentas desde un mismo lugar. Es generoso porque
  // todo un local (o un barrio con el mismo proveedor) puede salir con la misma IP.
  loginPerIp: { max: 20, timeWindow: 15 * 60_000 },
  // Por email, venga de donde venga: frena a quien ataca una cuenta desde muchas IPs.
  // Contra: alguien podría bloquear a otra persona 15 minutos fallando a propósito.
  // Lo aceptamos: es mucho menos grave que dejar adivinar la contraseña.
  loginPerEmail: { max: 10, timeWindow: 15 * 60_000 },
  // Por IP: evita que un script cree miles de cuentas.
  registerPerIp: { max: 10, timeWindow: 60 * 60_000 },
};

// El email del cuerpo, normalizado como lo hace el esquema, para que "Ana@x.com"
// y "ana@x.com" cuenten como la misma cuenta.
function emailKey(body: unknown): string {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Mismo error para "no existe el email" y "contraseña incorrecta":
// si fueran distintos, cualquiera podría averiguar qué emails tienen cuenta.
const INVALID_CREDENTIALS = { error: 'invalid_credentials', message: 'Email o contraseña incorrectos.' };

// Hash de una contraseña cualquiera, para gastar el mismo tiempo cuando el email no existe
// (ver login). Se calcula una sola vez, la primera vez que hace falta.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('contraseña-de-relleno-para-igualar-tiempos'));

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { users, sessions, memberships } = opts;

  // Corren como preHandler: para entonces el cuerpo ya está leído y podemos usar el email.
  // Cada regla lleva su propio contador; el prefijo de la clave es solo para leerlo mejor.
  const limitLogin = limiter(
    app,
    { ...AUTH_LIMITS.loginPerIp, keyGenerator: (req) => `login-ip:${req.ip}` },
    { ...AUTH_LIMITS.loginPerEmail, keyGenerator: (req) => `login-email:${emailKey(req.body)}` },
  );
  const limitRegister = limiter(app, { ...AUTH_LIMITS.registerPerIp, keyGenerator: (req) => `register-ip:${req.ip}` });

  // Arma la respuesta de register, login y me. Pasarla por meResponseSchema.parse
  // deja solo los campos del esquema: aunque `user` traiga passwordHash, no sale.
  async function buildMe(user: AuthUser): Promise<MeResponse> {
    return meResponseSchema.parse({
      user: { id: user.id, email: user.email, name: user.name },
      businesses: await memberships.listForUser(user.id),
    });
  }

  async function startSession(request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
    const { token, expiresAt } = await sessions.create(userId, request.headers['user-agent']);
    app.sessionCookie.set(reply, token, expiresAt);
  }

  app.post('/register', { preHandler: limitRegister }, async (request, reply) => {
    const parsed = registerInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    // Usamos parsed.data, no request.body: ahí el email ya está en minúsculas y sin espacios.
    const { name, email, password } = parsed.data;

    // Acá sí decimos que el email existe: en un registro no hay forma de ocultarlo
    // (igual el usuario tiene que saber por qué no puede crear la cuenta).
    const taken = { error: 'email_taken', message: 'Ya hay una cuenta con ese email.' };
    if (await users.findByEmail(email)) return reply.code(409).send(taken);

    try {
      const user = await users.create({ email, name, passwordHash: await hashPassword(password) });
      await startSession(request, reply, user.id);
      return reply.code(201).send(await buildMe(user));
    } catch (err) {
      // Dos registros simultáneos con el mismo email: los dos pasan findByEmail,
      // pero el índice único de la base frena al segundo.
      if (err instanceof EmailTakenError) return reply.code(409).send(taken);
      throw err;
    }
  });

  app.post('/login', { preHandler: limitLogin }, async (request, reply) => {
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const { email, password } = parsed.data;

    const user = await users.findByEmail(email);
    // Si el email no existe verificamos igual contra un hash de relleno. Argon2 tarda
    // a propósito: sin esto, "email inexistente" respondería mucho más rápido
    // y midiendo el tiempo se sabría qué emails tienen cuenta.
    const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
    if (!user || !ok) return reply.code(401).send(INVALID_CREDENTIALS);

    await startSession(request, reply, user.id);
    return reply.code(200).send(await buildMe(user));
  });

  app.post('/logout', async (request, reply) => {
    // Sin requireAuth: cerrar sesión siempre "funciona", aunque la cookie ya no sirva.
    const token = request.cookies[SESSION_COOKIE];
    if (token) await sessions.revoke(token);
    app.sessionCookie.clear(reply);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: requireAuth }, async (request) => {
    // requireAuth ya cortó con 401 si no había sesión, así que acá request.user existe.
    return buildMe(request.user!);
  });
}
