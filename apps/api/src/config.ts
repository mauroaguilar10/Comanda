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
  // Dirección pública de la API. Se usa para armar las URLs de las fotos guardadas en disco.
  PUBLIC_API_URL: z.url().default('http://localhost:3000'),
  // Fotos en Cloudflare R2. Si faltan, se guardan en disco (apps/api/uploads): sirve para
  // desarrollo, pero no en producción (el contenedor pierde el disco al redesplegar).
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.url().optional(),
  // Poné true si la API está detrás de un proxy (Caddy, nginx, Cloudflare). Así Fastify toma
  // la IP real del header X-Forwarded-For; si no, todos los pedidos parecen venir de la IP
  // del proxy y el límite de intentos por IP bloquearía a todos juntos.
  // Nunca true sin proxy: cualquiera podría inventar ese header y saltarse el límite.
  TRUST_PROXY: z.stringbool().default(false),
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

// Las cinco variables de R2 juntas, o ninguna: con algunas sí y otras no,
// es casi seguro un error de configuración y conviene que la API no arranque.
export function r2Config(config: Config) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = config;
  const values = [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL];
  if (values.every((v) => !v)) return null;
  if (values.some((v) => !v)) {
    throw new Error('Faltan variables de R2: hacen falta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_PUBLIC_URL.');
  }
  return {
    accountId: R2_ACCOUNT_ID!,
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
    bucket: R2_BUCKET!,
    publicUrl: R2_PUBLIC_URL!.replace(/\/$/, ''),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
