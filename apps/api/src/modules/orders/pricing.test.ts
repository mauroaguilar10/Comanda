import { describe, expect, it } from 'vitest';
import { priceOrder, ProductsUnavailableError } from './pricing.js';

const muzza = { id: '11111111-1111-4111-8111-111111111111', name: 'Muzzarella', priceCents: 900000, available: true };
const napo = { id: '22222222-2222-4222-8222-222222222222', name: 'Napolitana', priceCents: 1050050, available: true };
const fuga = { id: '33333333-3333-4333-8333-333333333333', name: 'Fugazzeta', priceCents: 1000000, available: false };

describe('priceOrder', () => {
  it('usa los precios del catálogo y suma el total', () => {
    const { lines, totalCents } = priceOrder(
      [
        { productId: muzza.id, quantity: 2 },
        { productId: napo.id, quantity: 1 },
      ],
      [muzza, napo],
    );

    expect(lines).toEqual([
      { productId: muzza.id, name: 'Muzzarella', unitPriceCents: 900000, quantity: 2 },
      { productId: napo.id, name: 'Napolitana', unitPriceCents: 1050050, quantity: 1 },
    ]);
    expect(totalCents).toBe(2 * 900000 + 1050050);
  });

  it('junta el mismo producto repetido en una línea', () => {
    const { lines } = priceOrder(
      [
        { productId: muzza.id, quantity: 2 },
        { productId: muzza.id, quantity: 1 },
      ],
      [muzza],
    );

    expect(lines).toEqual([{ productId: muzza.id, name: 'Muzzarella', unitPriceCents: 900000, quantity: 3 }]);
  });

  it('rechaza productos pausados o que no existen, diciendo cuáles', () => {
    const attempt = () =>
      priceOrder(
        [
          { productId: muzza.id, quantity: 1 },
          { productId: fuga.id, quantity: 1 },
          { productId: '44444444-4444-4444-8444-444444444444', quantity: 1 },
        ],
        [muzza, fuga],
      );

    expect(attempt).toThrow(ProductsUnavailableError);
    try {
      attempt();
    } catch (err) {
      expect((err as ProductsUnavailableError).names).toEqual(['Fugazzeta', 'un producto que ya no está en el menú']);
    }
  });
});
