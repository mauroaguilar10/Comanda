import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, pingDatabase } from './db.js';

const config = loadConfig();
const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : undefined;

const app = buildApp({
  logger: true,
  ...(pool && { checkDatabase: () => pingDatabase(pool) }),
});

// Cierre prolijo: al recibir Ctrl+C o la señal de Docker, termina las
// respuestas en curso y cierra las conexiones a la base.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool?.end();
    process.exit(0);
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
