import { describe, expect, it } from 'vitest';
import { cartCount, cartTotal, pruneCart, setQuantity } from './cart';

const muzza = { id: 'muzza', priceCents: 900000, available: true };
const napo = { id: 'napo', priceCents: 1050050, available: true };
const fuga = { id: 'fuga', priceCents: 1000000, available: false };

describe('carrito', () => {
  it('suma, cambia y saca cantidades', () => {
    let cart = setQuantity({}, 'muzza', 2);
    cart = setQuantity(cart, 'napo', 1);
    expect(cart).toEqual({ muzza: 2, napo: 1 });
    expect(cartCount(cart)).toBe(3);

    cart = setQuantity(cart, 'muzza', 0);
    expect(cart).toEqual({ napo: 1 });
  });

  it('no baja de 0 ni pasa del máximo', () => {
    expect(setQuantity({}, 'muzza', -3)).toEqual({});
    expect(setQuantity({}, 'muzza', 999)).toEqual({ muzza: 50 });
  });

  it('el total usa los precios del menú e ignora lo pausado o borrado', () => {
    expect(cartTotal({ muzza: 2, napo: 1, fuga: 1, borrado: 3 }, [muzza, napo, fuga])).toBe(2 * 900000 + 1050050);
  });

  it('pruneCart saca lo que ya no se puede pedir', () => {
    expect(pruneCart({ muzza: 2, fuga: 1, borrado: 3 }, [muzza, fuga])).toEqual({ muzza: 2 });
  });
});
