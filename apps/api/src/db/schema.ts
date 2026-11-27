import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Esquema de la etapa 1: personas, sesiones, negocios y quién trabaja en cada uno.
// Drizzle lee este archivo para generar las migraciones SQL (pnpm db:generate).

// Los roles posibles dentro de un negocio. Es un enum de Postgres:
// la base rechaza cualquier valor que no esté en esta lista.
export const roleEnum = pgEnum('role', ['owner', 'manager', 'kitchen', 'driver']);

// Columnas de fecha que repiten todas las tablas.
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Se guarda siempre en minúsculas (lo hace el servicio), así el índice único
    // impide que "Mauro@x.com" y "mauro@x.com" sean dos cuentas.
    email: text('email').notNull(),
    name: text('name').notNull(),
    // Nunca la contraseña: solo el hash de Argon2.
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // El token viaja en la cookie; acá guardamos solo su hash SHA-256.
    // Si alguien roba la base, no puede usar las sesiones.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_hash_unique').on(t.tokenHash), index('sessions_user_id_idx').on(t.userId)],
);

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // Parte de la URL de la tienda: pedir.mauroaglr.com/<slug>
    slug: text('slug').notNull(),
    // Define las plantillas (categorías, estados, textos). Por ahora solo 'food'.
    businessType: text('business_type').notNull().default('food'),
    phone: text('phone'),
    address: text('address'),
    timezone: text('timezone').notNull().default('America/Argentina/San_Luis'),
    ...timestamps,
  },
  (t) => [uniqueIndex('businesses_slug_unique').on(t.slug)],
);

// Une personas con negocios. Una persona puede trabajar en varios locales
// y tener un rol distinto en cada uno.
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('memberships_business_user_unique').on(t.businessId, t.userId),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
