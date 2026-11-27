import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createPool, pingDatabase } from './db.js';
import { createSessionService } from './modules/auth/sessions.js';
import { createUserRepository } from './modules/auth/users.js';
import { createMembershipLookup } from './modules/businesses/memberships.js';

const config = loadConfig();
const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : undefined;
const db = pool ? createDb(pool) : undefined;

const app = await buildApp({
  logger: true,
  secureCookies: config.NODE_ENV === 'production',
  ...(pool && { checkDatabase: () => pingDatabase(pool) }),
  ...(db && {
    sessions: createSessionService(db),
    memberships: createMembershipLookup(db),
    users: createUserRepository(db),
  }),
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
