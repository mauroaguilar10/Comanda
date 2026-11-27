import { describe, expect, it } from 'vitest';
import { matchStoreRoute, storePath, storeUrl } from './store-url';

describe('matchStoreRoute', () => {
  it('en desarrollo la tienda va bajo /tienda', () => {
    expect(matchStoreRoute('/tienda/don-mario', 'localhost')).toEqual({ slug: 'don-mario' });
    expect(matchStoreRoute('/tienda/don-mario/pedido/abc_1-2', 'localhost')).toEqual({ slug: 'don-mario', token: 'abc_1-2' });
    expect(matchStoreRoute('/don-mario', 'localhost')).toBeNull();
    expect(matchStoreRoute('/locales/x', 'localhost')).toBeNull();
  });

  it('en pedir.* la tienda está en la raíz', () => {
    expect(matchStoreRoute('/don-mario', 'pedir.mauroaglr.com')).toEqual({ slug: 'don-mario' });
    expect(matchStoreRoute('/don-mario/pedido/abc', 'pedir.mauroaglr.com')).toEqual({ slug: 'don-mario', token: 'abc' });
    expect(matchStoreRoute('/', 'pedir.mauroaglr.com')).toBeNull();
  });
});

describe('storePath y storeUrl', () => {
  it('arman la dirección según el dominio', () => {
    expect(storePath('localhost', 'don-mario', 'abc')).toBe('/tienda/don-mario/pedido/abc');
    expect(storePath('pedir.mauroaglr.com', 'don-mario')).toBe('/don-mario');
    expect(storeUrl({ hostname: 'app.mauroaglr.com', origin: 'https://app.mauroaglr.com', protocol: 'https:' }, 'don-mario')).toBe(
      'https://pedir.mauroaglr.com/don-mario',
    );
    expect(storeUrl({ hostname: 'localhost', origin: 'http://localhost:5173', protocol: 'http:' }, 'don-mario')).toBe(
      'http://localhost:5173/tienda/don-mario',
    );
  });
});
