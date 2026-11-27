import Fastify, { type FastifyInstance } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@comanda/shared';

export interface AppDeps {
  // La app no sabe cómo se chequea la base: se lo pasan de afuera.
  // Así en los tests le pasamos una función falsa (un mock) y no necesitamos Postgres.
  checkDatabase?: () => Promise<boolean>;
  logger?: boolean;
}

// buildApp arma la aplicación sin ponerla a escuchar en un puerto.
// server.ts la levanta de verdad; los tests la usan con app.inject().
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

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

  return app;
}
