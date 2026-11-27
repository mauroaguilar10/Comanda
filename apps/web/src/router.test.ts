import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReturnTo, withReturnTo } from './router';

// Los tests corren en Node, sin navegador: simulamos window.location.search.
function setSearch(search: string) {
  vi.stubGlobal('window', { location: { search } });
}

afterEach(() => vi.unstubAllGlobals());

describe('getReturnTo', () => {
  it('acepta rutas internas', () => {
    setSearch('?volver=%2Finvitacion%2Fabc');
    expect(getReturnTo()).toBe('/invitacion/abc');
  });

  it.each(['https://sitio-falso.com', '//sitio-falso.com', '/\\sitio-falso.com', 'invitacion/abc', ''])(
    'rechaza "%s"',
    (value) => {
      setSearch(`?volver=${encodeURIComponent(value)}`);
      expect(getReturnTo()).toBeNull();
    },
  );

  it('sin el parámetro devuelve null', () => {
    setSearch('');
    expect(getReturnTo()).toBeNull();
  });
});

describe('withReturnTo', () => {
  it('codifica la ruta de vuelta y los extras', () => {
    expect(withReturnTo('/registro', '/invitacion/abc', { email: 'beto@example.com' })).toBe(
      '/registro?email=beto%40example.com&volver=%2Finvitacion%2Fabc',
    );
  });
});
