import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@comanda/shared';
import { authRoutes } from './modules/auth/routes.js';
import type { SessionService } from './modules/auth/sessions.js';
import type { UserRepository } from './modules/auth/users.js';
import type { BusinessService } from './modules/businesses/businesses.js';
import type { CatalogService } from './modules/catalog/catalog.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { noOrderEvents, type OrderEvents } from './modules/orders/events.js';
import type { OrdersService } from './modules/orders/orders.js';
import { ordersRoutes, storeRoutes } from './modules/orders/routes.js';
import type { MembershipLookup } from './modules/businesses/memberships.js';
import { businessRoutes } from './modules/businesses/routes.js';
import type { TeamService } from './modules/businesses/team.js';
import { invitationRoutes, teamRoutes } from './modules/businesses/team-routes.js';
import type { FileStorage } from './lib/storage.js';
import { registerAuth } from './plugins/auth.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { attachRealtime } from './plugins/realtime.js';

export interface AppDeps {
  // La app no sabe cómo se chequea la base: se lo pasan de afuera.
  // Así en los tests le pasamos una función falsa (un mock) y no necesitamos Postgres.
  checkDatabase?: () => Promise<boolean>;
  // Lo mismo con sesiones y membresías: en producción vienen con Drizzle,
  // en los tests son falsas.
  sessions?: SessionService;
  memberships?: MembershipLookup;
  users?: UserRepository;
  businesses?: BusinessService;
  catalog?: CatalogService;
  team?: TeamService;
  storage?: FileStorage;
  orders?: OrdersService;
  // Socket.IO para el tiempo real. Apagado por defecto: la mayoría de los tests no lo usa.
  realtime?: boolean;
  // Para tests: reemplaza el emisor de eventos de pedidos (por ejemplo, uno que los anota).
  orderEvents?: OrderEvents;
  // Solo con el almacenamiento en disco (desarrollo): lee un archivo para servirlo en /uploads.
  readUpload?: (key: string) => Promise<Buffer | null>;
  secureCookies?: boolean;
  // Orígenes del navegador que pueden llamar a la API con cookies (ver config.ts).
  corsOrigins?: string[];
  // true cuando la API corre detrás de un proxy (Caddy, nginx, Cloudflare). Ver config.ts.
  trustProxy?: boolean;
  logger?: boolean;
}

// buildApp arma la aplicación sin ponerla a escuchar en un puerto.
// server.ts la levanta de verdad; los tests la usan con app.inject().
export async function buildApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: deps.trustProxy ?? false });

  // CORS: la web (app.mauroaglr.com) y la API (api.mauroaglr.com) son orígenes distintos.
  // Por defecto el navegador no deja que una página lea respuestas de otro origen;
  // con esto la API le dice "a estos orígenes, sí, y con cookies".
  // Nunca usar origin: '*' acá: con credentials permitiría que cualquier sitio
  // haga pedidos con la sesión del usuario.
  if (deps.corsOrigins?.length) {
    await app.register(cors, {
      origin: deps.corsOrigins,
      credentials: true,
      // Por defecto el plugin solo permite GET, HEAD y POST: sin esto, el navegador
      // bloquea subir fotos (PUT), editar (PATCH) y borrar (DELETE) cuando la web está en otro dominio.
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });
  }

  await registerRateLimit(app);

  if (deps.sessions) {
    await registerAuth(app, { sessions: deps.sessions, secureCookies: deps.secureCookies ?? false });
  }

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

  // Cada módulo registra sus rutas solo si le pasaron lo que necesita.
  // Así un test de /health no tiene que armar usuarios ni sesiones.
  const { sessions, memberships, users, businesses, catalog, team, storage, orders } = deps;
  if (sessions && memberships && users) {
    await app.register(authRoutes, { prefix: '/auth', users, sessions, memberships });
  }
  if (sessions && memberships && businesses) {
    await app.register(businessRoutes, { prefix: '/businesses', businesses, memberships });
  }
  if (sessions && memberships && catalog && storage) {
    // El prefijo lleva el :businessId: todas las rutas del catálogo son de un local.
    await app.register(catalogRoutes, { prefix: '/businesses/:businessId', catalog, memberships, storage });
  }

  if (sessions && memberships && orders && businesses && catalog && storage) {
    const events =
      deps.orderEvents ??
      (deps.realtime ? attachRealtime(app, { sessions, memberships, orders, corsOrigins: deps.corsOrigins ?? [] }) : noOrderEvents);
    // Tienda pública (sin sesión) y panel de pedidos del local.
    await app.register(storeRoutes, { prefix: '/store', orders, businesses, catalog, storage, events });
    await app.register(ordersRoutes, { prefix: '/businesses/:businessId', orders, memberships, events });
  }

  // Fotos guardadas en disco (desarrollo). En producción las sirve R2 directo, no la API.
  const { readUpload } = deps;
  if (readUpload) {
    const types: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
    app.get('/uploads/*', async (request, reply) => {
      const key = (request.params as { '*': string })['*'];
      const file = await readUpload(key);
      if (!file) return reply.code(404).send({ error: 'not_found', message: 'No existe esa foto.' });
      return reply
        .type(types[key.split('.').pop()!] ?? 'application/octet-stream')
        // nosniff: el navegador respeta el tipo que decimos y no "adivina" otro (por ejemplo, HTML).
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'public, max-age=31536000, immutable')
        .send(file);
    });
  }
  if (sessions && memberships && team) {
    await app.register(teamRoutes, { prefix: '/businesses/:businessId', team, memberships });
    await app.register(invitationRoutes, { prefix: '/invitations', team });
  }

  return app;
}
