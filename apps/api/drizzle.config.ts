import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('../../.env');
} catch {
  // Sin .env: se usan las variables del entorno.
}

// drizzle-kit compara schema.ts con las migraciones existentes
// y genera el SQL que falta en la carpeta drizzle/.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://comanda:comanda@localhost:5432/comanda',
  },
});
