import { z } from 'zod';

// Respuesta de GET /health. La API la valida antes de responder
// y la web la usa para saber qué datos va a recibir.
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'error', 'not_configured']),
  uptimeSeconds: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
