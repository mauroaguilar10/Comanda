import Fastify, { type FastifyInstance } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@comanda/shared';
import { authRoutes } from './modules/auth/routes.js';
import type { SessionService } from './modules/auth/sessions.js';
import type { UserRepository } from './modules/auth/users.js';
import type { BusinessService } from './modules/businesses/businesses.js';
import type { MembershipLookup } from './modules/businesses/memberships.js';
import { businessRoutes } from './modules/businesses/routes.js';
import { registerAuth } from './plugins/auth.js';

export interface AppDeps {
  // La app no sabe cómo se chequea la base: se lo pasan de afuera.
  // Así en los tests le pasamos una función falsa (un mock) y no necesitamos Postgres.
  checkDatabase?: () => Promise<boolean>;
  // Lo mismo con sesiones y membresías: en producción vienen con Drizzle,
  // en los tests son falsas.
  sessions?: SessionService;
  memberships?: MembershipLookup;
  users?: UserRepository;
  businesses?: BusinessService;
  secureCookies?: boolean;
  logger?: boolean;
}

// buildApp arma la aplicación sin ponerla a escuchar en un puerto.
// server.ts la levanta de verdad; los tests la usan con app.inject().
export async function buildApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });

  if (deps.sessions) {
    await registerAuth(app, { sessions: deps.sessions, secureCookies: deps.secureCookies ?? false });
  }

  app.get('/health', async (): Promise<HealthResponse> => {
    let database: HealthResponse['database'] = 'not_configured';
    if (deps.checkDatabase) {
      database = (await deps.checkDatabase()) ? 'ok' : 'error';
    }

    return healthResponseSchema.parse({
      status: database === 'error' ? 'degraded' : 'ok',
      database,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Cada módulo registra sus rutas solo si le pasaron lo que necesita.
  // Así un test de /health no tiene que armar usuarios ni sesiones.
  const { sessions, memberships, users, businesses } = deps;
  if (sessions && memberships && users) {
    await app.register(authRoutes, { prefix: '/auth', users, sessions, memberships });
  }
  if (sessions && memberships && businesses) {
    await app.register(businessRoutes, { prefix: '/businesses', businesses, memberships });
  }

  return app;
}
