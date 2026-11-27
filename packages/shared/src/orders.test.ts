import { describe, expect, it } from 'vitest';
import { canChangeStatus, createOrderInputSchema, nextStatuses } from './orders.js';

describe('nextStatuses', () => {
  it('el retiro no pasa por "en camino"', () => {
    expect(nextStatuses('ready', 'takeaway')).toEqual(['delivered', 'cancelled']);
    expect(nextStatuses('ready', 'delivery')).toEqual(['on_the_way', 'cancelled']);
  });

  it('entregado y cancelado son finales', () => {
    expect(nextStatuses('delivered', 'delivery')).toEqual([]);
    expect(nextStatuses('cancelled', 'takeaway')).toEqual([]);
  });
});

describe('canChangeStatus', () => {
  it('cocina prepara pero no cancela', () => {
    expect(canChangeStatus('kitchen', 'received', 'preparing', 'delivery')).toBe(true);
    expect(canChangeStatus('kitchen', 'received', 'cancelled', 'delivery')).toBe(false);
  });

  it('cocina entrega los de retiro, no los envíos', () => {
    expect(canChangeStatus('kitchen', 'ready', 'delivered', 'takeaway')).toBe(true);
    expect(canChangeStatus('kitchen', 'ready', 'on_the_way', 'delivery')).toBe(false);
  });

  it('reparto lleva envíos y no toca la cocina', () => {
    expect(canChangeStatus('driver', 'ready', 'on_the_way', 'delivery')).toBe(true);
    expect(canChangeStatus('driver', 'on_the_way', 'delivered', 'delivery')).toBe(true);
    expect(canChangeStatus('driver', 'received', 'preparing', 'delivery')).toBe(false);
  });

  it('nadie salta estados, ni el dueño', () => {
    expect(canChangeStatus('owner', 'received', 'delivered', 'takeaway')).toBe(false);
    expect(canChangeStatus('owner', 'delivered', 'cancelled', 'takeaway')).toBe(false);
  });
});

describe('createOrderInputSchema', () => {
  const base = {
    items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
    customerName: 'Beto',
    customerPhone: '2657 12-3456',
    paymentMethod: 'cash',
  };

  it('el envío necesita dirección; el retiro no', () => {
    const delivery = createOrderInputSchema.safeParse({ ...base, fulfillment: 'delivery' });
    expect(delivery.success).toBe(false);
    expect(delivery.error?.issues[0]).toMatchObject({ path: ['address'], message: 'Poné la dirección de entrega' });
    expect(createOrderInputSchema.safeParse({ ...base, fulfillment: 'takeaway' }).success).toBe(true);
    expect(createOrderInputSchema.safeParse({ ...base, fulfillment: 'delivery', address: 'Pedernera 123' }).success).toBe(true);
  });

  it('no acepta precios: los ignora', () => {
    const parsed = createOrderInputSchema.parse({
      ...base,
      fulfillment: 'takeaway',
      items: [{ productId: base.items[0]!.productId, quantity: 1, unitPriceCents: 1 }],
      totalCents: 1,
    });
    expect(parsed.items[0]).toEqual({ productId: base.items[0]!.productId, quantity: 1 });
    expect(parsed).not.toHaveProperty('totalCents');
  });
});
