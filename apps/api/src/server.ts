import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig, r2Config } from './config.js';
import { createDb } from './db/client.js';
import { createPool, pingDatabase } from './db.js';
import { createLocalStorage, createR2Storage } from './lib/storage.js';
import { createSessionService } from './modules/auth/sessions.js';
import { createUserRepository } from './modules/auth/users.js';
import { createBusinessService } from './modules/businesses/businesses.js';
import { createCatalogService } from './modules/catalog/catalog.js';
import { createMembershipLookup } from './modules/businesses/memberships.js';
import { createTeamService } from './modules/businesses/team.js';

const config = loadConfig();
const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : undefined;
const db = pool ? createDb(pool) : undefined;

// users se crea una vez y lo comparten auth (rutas) y el equipo (que no lee la tabla users directo).
const users = db ? createUserRepository(db) : undefined;

// Fotos: R2 si está configurado; si no, una carpeta local que sirve la propia API.
const r2 = r2Config(config);
// fileURLToPath convierte la URL del módulo en una ruta del sistema (C:\... en Windows).
// '../uploads' queda en apps/api/uploads, tanto desde src/ como desde dist/.
const diskStorage = r2 ? undefined : createLocalStorage(fileURLToPath(new URL('../uploads', import.meta.url)), config.PUBLIC_API_URL);
const storage = r2 ? createR2Storage(r2) : diskStorage!;

const app = await buildApp({
  logger: true,
  secureCookies: config.NODE_ENV === 'production',
  corsOrigins: config.CORS_ORIGINS,
  storage,
  ...(diskStorage && { readUpload: diskStorage.read }),
  trustProxy: config.TRUST_PROXY,
  ...(pool && { checkDatabase: () => pingDatabase(pool) }),
  ...(db && {
    sessions: createSessionService(db),
    memberships: createMembershipLookup(db),
    users,
    businesses: createBusinessService(db),
    catalog: createCatalogService(db),
    team: createTeamService(db, users!),
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
