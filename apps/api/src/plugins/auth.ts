import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Role } from '../db/schema.js';
import type { AuthUser, SessionService } from '../modules/auth/sessions.js';
import type { MembershipLookup } from '../modules/businesses/memberships.js';

export const SESSION_COOKIE = 'comanda_session';

// Le avisamos a TypeScript que cada request tiene estos dos campos.
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    membership: { businessId: string; role: Role } | null;
  }
}

export interface AuthOptions {
  sessions: SessionService;
  secureCookies: boolean;
}

// Se llama una vez desde buildApp. En cada request lee la cookie,
// busca la sesión y deja el usuario en request.user (o null).
export async function registerAuth(app: FastifyInstance, opts: AuthOptions): Promise<void> {
  await app.register(cookie);
  app.decorateRequest('user', null);
  app.decorateRequest('membership', null);

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.user = token ? await opts.sessions.resolve(token) : null;
  });

  app.decorate('sessionCookie', {
    set(reply: FastifyReply, token: string, expiresAt: Date) {
      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true, // JavaScript del navegador no la puede leer: protege contra XSS
        sameSite: 'lax', // no se manda desde otros sitios: protege contra CSRF
        secure: opts.secureCookies, // solo por HTTPS en producción
        expires: expiresAt,
      });
    },
    clear(reply: FastifyReply) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
    },
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    sessionCookie: {
      set(reply: FastifyReply, token: string, expiresAt: Date): void;
      clear(reply: FastifyReply): void;
    };
  }
}

// Guardia: corta con 401 si no hay sesión. Se usa como preHandler de una ruta.
export const requireAuth: preHandlerAsyncHookHandler = async (request, reply) => {
  if (!request.user) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Tenés que iniciar sesión.' });
  }
};

// Guardia: corta con 403 si el usuario no tiene alguno de esos roles en el negocio
// de la URL (/businesses/:businessId/...). El dueño siempre pasa.
// Se chequea en el backend: esconder un botón en el frontend no protege nada.
export function requireRole(memberships: MembershipLookup, ...roles: Role[]): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Tenés que iniciar sesión.' });
    }
    const { businessId } = request.params as { businessId?: string };
    if (!businessId) {
      throw new Error('requireRole necesita una ruta con :businessId');
    }

    const role = await memberships.getRole(request.user.id, businessId);
    if (!role || (role !== 'owner' && !roles.includes(role))) {
      // Mismo error si no es miembro o si no le alcanza el rol: no revelamos qué negocios existen.
      return reply.code(403).send({ error: 'forbidden', message: 'No tenés permiso para esto.' });
    }
    request.membership = { businessId, role };
  };
}
