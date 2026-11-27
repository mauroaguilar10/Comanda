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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.url().optional(),
  // Orígenes (dominios) desde donde un navegador puede llamar a la API con la cookie
  // de sesión, separados por coma. En producción: https://app.mauroaglr.com,https://pedir.mauroaglr.com
  // En desarrollo no hace falta: Vite hace de proxy y el navegador ve un solo origen.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    // new URL(...).origin deja solo esquema + dominio + puerto: "https://app.mauroaglr.com/"
    // pasa a "https://app.mauroaglr.com", que es lo que manda el navegador en el header Origin.
    .pipe(z.array(z.url().transform((u) => new URL(u).origin))),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
