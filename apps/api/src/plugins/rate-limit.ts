import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

// Límite de pedidos por ventana de tiempo. Sin esto, alguien puede probar contraseñas
// contra una cuenta sin parar: Argon2 hace cada intento lento, pero no lo frena.
//
// Los contadores viven en memoria del proceso. Alcanza mientras haya una sola instancia
// de la API; con varias habría que guardarlos en Redis o Postgres para que se compartan.
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  // global: false -> no limita ninguna ruta por su cuenta; solo nos da app.createRateLimit.
  await app.register(rateLimit, { global: false });
}

export interface LimitRule {
  max: number;
  timeWindow: number; // milisegundos
  // Qué se cuenta: la IP, el email, etc. Pedidos con la misma clave comparten contador.
  keyGenerator: (request: FastifyRequest) => string;
}

// Arma un preHandler que aplica varias reglas a la vez (por ejemplo, por IP y por email).
// No usamos app.rateLimit() porque el plugin corta después del primer limitador de cada
// pedido; createRateLimit solo cuenta y nos deja decidir a nosotros.
export function limiter(app: FastifyInstance, ...rules: LimitRule[]): preHandlerAsyncHookHandler {
  const checks = rules.map((rule) => app.createRateLimit(rule));

  return async (request, reply) => {
    for (const check of checks) {
      const result = await check(request);
      if (!result.isAllowed && result.isExceeded) {
        const minutes = Math.max(1, Math.ceil(result.ttl / 60_000));
        // Retry-After es el header estándar para decir cuántos segundos esperar.
        reply.header('retry-after', result.ttlInSeconds);
        return reply.code(429).send({
          error: 'too_many_requests',
          message: `Demasiados intentos. Probá de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
        });
      }
    }
  };
}
