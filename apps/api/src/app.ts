import Fastify, { type FastifyInstance } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@comanda/shared';
import type { SessionService } from './modules/auth/sessions.js';
import type { MembershipLookup } from './modules/businesses/memberships.js';
import { registerAuth } from './plugins/auth.js';

export interface AppDeps {
  // La app no sabe cómo se chequea la base: se lo pasan de afuera.
  // Así en los tests le pasamos una función falsa (un mock) y no necesitamos Postgres.
  checkDatabase?: () => Promise<boolean>;
  // Lo mismo con sesiones y membresías: en producción vienen con Drizzle,
  // en los tests son falsas.
  sessions?: SessionService;
  memberships?: MembershipLookup;
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

  // Etapa 1 (lo escribe Mauro, ver docs/etapa-1.md):
  // await app.register(authRoutes, { prefix: '/auth', ... });
  // await app.register(businessRoutes, { prefix: '/businesses', ... });

  return app;
}
