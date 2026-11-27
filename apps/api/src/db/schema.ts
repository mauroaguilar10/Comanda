import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

// Invitaciones para sumarse a un local. El dueño o encargado la crea y comparte un link
// con el token; la persona invitada entra con ese link y, logueada con ese email, la acepta.
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // Solo esta persona puede aceptarla (en minúsculas, como users.email).
    email: text('email').notNull(),
    role: roleEnum('role').notNull(),
    // Igual que en sessions: el token viaja en el link y acá guardamos solo su hash.
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // null = pendiente. Se completa al aceptarla: un link sirve una sola vez.
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invitations_token_hash_unique').on(t.tokenHash), index('invitations_business_id_idx').on(t.businessId)],
);

// Catálogo: cada local organiza sus productos en categorías ("Pizzas", "Empanadas", "Bebidas").
// Las dos tablas llevan business_id aunque el producto ya sepa su categoría: así cada consulta
// filtra por local directamente y es imposible mezclar el menú de dos negocios.
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Orden en el menú (menor primero). Las nuevas van al final.
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('categories_business_id_idx').on(t.businessId)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // no action: la base no deja borrar una categoría que todavía tiene productos,
    // así nunca quedan productos "huérfanos" fuera del menú. Es como restrict, pero el
    // chequeo se hace al final de la operación: si se borra el local entero, la cascada
    // alcanza a borrar también los productos antes de que se queje.
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'no action' }),
    name: text('name').notNull(),
    description: text('description'),
    // En centavos y entero: con decimales (0.1 + 0.2 = 0.30000000000000004) los totales
    // de los pedidos terminarían con errores de redondeo.
    priceCents: integer('price_cents').notNull(),
    // false = "sin stock por hoy": sigue cargado pero no se puede pedir.
    available: boolean('available').notNull().default(true),
    // Clave de la foto en el almacenamiento (R2 o disco), no la URL: si mañana cambia
    // el dominio de las fotos, solo cambia la configuración, no los datos.
    imageKey: text('image_key'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('products_business_id_idx').on(t.businessId),
    index('products_category_id_idx').on(t.categoryId),
    // Segunda red de seguridad además de Zod: la base rechaza precios negativos.
    check('products_price_cents_non_negative', sql`${t.priceCents} >= 0`),
  ],
);

// ─── Pedidos (etapa 2) ───────────────────────────────────────────────────────

export const orderStatusEnum = pgEnum('order_status', [
  'received', // recibido
  'preparing', // en preparación
  'ready', // listo
  'on_the_way', // en camino (solo envíos)
  'delivered', // entregado o retirado
  'cancelled',
]);
export const fulfillmentEnum = pgEnum('fulfillment', ['takeaway', 'delivery']);
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'transfer']);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // Número corto por local (#1, #2...): lo que se dice en el mostrador.
    number: integer('number').notNull(),
    status: orderStatusEnum('status').notNull().default('received'),
    fulfillment: fulfillmentEnum('fulfillment').notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    // Solo para envíos.
    address: text('address'),
    notes: text('notes'),
    totalCents: integer('total_cents').notNull(),
    // El link de seguimiento lleva el token; acá, como siempre, solo su hash.
    trackingTokenHash: text('tracking_token_hash').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('orders_business_number_unique').on(t.businessId, t.number),
    uniqueIndex('orders_tracking_token_hash_unique').on(t.trackingTokenHash),
    // El panel busca "los pedidos de este local en estos estados".
    index('orders_business_status_idx').on(t.businessId, t.status),
    check('orders_total_non_negative', sql`${t.totalCents} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // set null: si el local borra el producto, el pedido viejo sigue existiendo.
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    // Copia del nombre y el precio al momento del pedido.
    name: text('name').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

// Último número de pedido usado por cada local. Ver docs/etapa-2.md.
export const orderSequences = pgTable('order_sequences', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  lastNumber: integer('last_number').notNull(),
});

// Configuración de la tienda pública. Si no hay fila, valen los valores por defecto.
export const storeSettings = pgTable('store_settings', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  acceptingOrders: boolean('accepting_orders').notNull().default(true),
  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Invitation = typeof invitations.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
