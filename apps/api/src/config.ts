import { z } from 'zod';

// Lee el .env de la raíz del repo si existe (en producción las variables
// vienen del servidor y el archivo no está).
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Sin .env: se usan las variables del entorno.
}

// Validamos las variables al arrancar: si falta algo, la API no levanta
// y el error dice qué falta, en vez de fallar más tarde con un mensaje raro.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.url().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
