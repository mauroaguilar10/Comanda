import type { CreateOrderInput, OrderStatus } from '@comanda/shared';
import { ACTIVE_STATUSES } from '@comanda/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { orderItems, orders, orderSequences, storeSettings, type Order, type OrderItem } from '../../db/schema.js';
import { generateToken, hashToken } from '../../lib/tokens.js';
import type { OrderLine } from './pricing.js';

export type OrderWithItems = Order & { items: OrderItem[] };

export interface OrdersService {
  getSettings(businessId: string): Promise<{ acceptingOrders: boolean }>;
  updateSettings(businessId: string, settings: { acceptingOrders: boolean }): Promise<{ acceptingOrders: boolean }>;
  // Las líneas ya vienen con precio (ver pricing.ts). Devuelve el token de seguimiento en claro.
  createOrder(
    businessId: string,
    input: Omit<CreateOrderInput, 'items'>,
    lines: OrderLine[],
    totalCents: number,
  ): Promise<{ order: Order; trackingToken: string }>;
  // Pedidos en curso del local, del más viejo al más nuevo (el que espera hace más, primero).
  listActive(businessId: string): Promise<OrderWithItems[]>;
  findById(businessId: string, orderId: string): Promise<Order | null>;
  findByTrackingToken(token: string): Promise<OrderWithItems | null>;
  // Cambia el estado solo si sigue siendo `from`. Si alguien lo cambió en el medio
  // (dos personas tocando el mismo pedido), devuelve null y no pisa nada.
  updateStatus(businessId: string, orderId: string, from: OrderStatus, to: OrderStatus): Promise<Order | null>;
}

export function createOrdersService(db: Db): OrdersService {
  async function withItems(rows: Order[]): Promise<OrderWithItems[]> {
    if (rows.length === 0) return [];
    const items = await db
      .select()
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          rows.map((o) => o.id),
        ),
      )
      .orderBy(asc(orderItems.position));
    return rows.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
  }

  return {
    async getSettings(businessId) {
      const [row] = await db.select().from(storeSettings).where(eq(storeSettings.businessId, businessId)).limit(1);
      // Sin fila = valores por defecto (tienda abierta).
      return { acceptingOrders: row?.acceptingOrders ?? true };
    },

    async updateSettings(businessId, settings) {
      // "Upsert": crea la fila la primera vez y la actualiza las siguientes.
      const [row] = await db
        .insert(storeSettings)
        .values({ businessId, ...settings })
        .onConflictDoUpdate({ target: storeSettings.businessId, set: settings })
        .returning();
      return { acceptingOrders: row!.acceptingOrders };
    },

    async createOrder(businessId, input, lines, totalCents) {
      const trackingToken = generateToken();
      const order = await db.transaction(async (tx) => {
        // Número siguiente para este local, atómico: el UPDATE bloquea la fila hasta el
        // final de la transacción, así que dos pedidos simultáneos no reciben el mismo.
        const [seq] = await tx
          .insert(orderSequences)
          .values({ businessId, lastNumber: 1 })
          .onConflictDoUpdate({ target: orderSequences.businessId, set: { lastNumber: sql`${orderSequences.lastNumber} + 1` } })
          .returning();

        const [row] = await tx
          .insert(orders)
          .values({
            businessId,
            number: seq!.lastNumber,
            fulfillment: input.fulfillment,
            paymentMethod: input.paymentMethod,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            // Si es retiro, la dirección no se guarda aunque la hayan mandado.
            address: input.fulfillment === 'delivery' ? input.address : null,
            notes: input.notes || null,
            totalCents,
            trackingTokenHash: hashToken(trackingToken),
          })
          .returning();

        await tx.insert(orderItems).values(
          lines.map((line, position) => ({
            orderId: row!.id,
            productId: line.productId,
            name: line.name,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            position,
          })),
        );
        return row!;
      });
      return { order, trackingToken };
    },

    async listActive(businessId) {
      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.businessId, businessId), inArray(orders.status, ACTIVE_STATUSES)))
        .orderBy(asc(orders.createdAt));
      return withItems(rows);
    },

    async findById(businessId, orderId) {
      const [row] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.businessId, businessId)))
        .limit(1);
      return row ?? null;
    },

    async findByTrackingToken(token) {
      const [row] = await db.select().from(orders).where(eq(orders.trackingTokenHash, hashToken(token))).limit(1);
      if (!row) return null;
      return (await withItems([row]))[0]!;
    },

    async updateStatus(businessId, orderId, from, to) {
      // El "where status = from" es un bloqueo optimista: no leemos y después escribimos,
      // escribimos con la condición. Si no coincide, no se actualiza ninguna fila.
      const [row] = await db
        .update(orders)
        .set({ status: to })
        .where(and(eq(orders.id, orderId), eq(orders.businessId, businessId), eq(orders.status, from)))
        .returning();
      return row ?? null;
    },
  };
}
