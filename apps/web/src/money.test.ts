import { describe, expect, it } from 'vitest';
import { centsToInput, formatPrice, parsePrice } from './money';

describe('parsePrice', () => {
  it.each([
    ['4500', 450000],
    ['4.500', 450000],
    ['1.250.000', 125000000],
    ['4500,50', 450050],
    ['4.500,5', 450050],
    ['$ 4.500,50', 450050],
    ['4500.50', 450050],
    ['4500.1', 450010],
    ['0', 0],
    [' 900 ', 90000],
  ])('"%s" -> %i centavos', (text, cents) => {
    expect(parsePrice(text)).toBe(cents);
  });

  it.each(['', 'abc', '-100', '45,505', '4,500,00', '12.34.5'])('"%s" no se entiende', (text) => {
    expect(parsePrice(text)).toBeNull();
  });
});

describe('formatPrice', () => {
  it('usa el formato argentino', () => {
    // Intl separa "$" y el número con un espacio duro (U+00A0).
    expect(formatPrice(450050).replace(/\s/g, ' ')).toBe('$ 4.500,50');
  });

  it('sin ",00" cuando el precio es redondo', () => {
    expect(formatPrice(900000).replace(/\s/g, ' ')).toBe('$ 9.000');
  });
});

describe('centsToInput', () => {
  it('vuelve a un texto que parsePrice entiende', () => {
    for (const cents of [0, 5, 450000, 450050, 125000000]) {
      expect(parsePrice(centsToInput(cents))).toBe(cents);
    }
  });
});
