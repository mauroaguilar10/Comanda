import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('CORS_ORIGINS', () => {
  it('sin la variable queda vacío', () => {
    expect(loadConfig({}).CORS_ORIGINS).toEqual([]);
  });

  it('separa por coma e ignora espacios', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://app.mauroaglr.com, https://pedir.mauroaglr.com' });
    expect(config.CORS_ORIGINS).toEqual(['https://app.mauroaglr.com', 'https://pedir.mauroaglr.com']);
  });

  it('saca la barra final, que el navegador no manda', () => {
    expect(loadConfig({ CORS_ORIGINS: 'https://app.mauroaglr.com/' }).CORS_ORIGINS).toEqual(['https://app.mauroaglr.com']);
  });

  it('rechaza algo que no es una URL (la API no arranca)', () => {
    expect(() => loadConfig({ CORS_ORIGINS: 'app.mauroaglr.com' })).toThrow();
  });
});

describe('TRUST_PROXY', () => {
  it('por defecto es false', () => {
    expect(loadConfig({}).TRUST_PROXY).toBe(false);
  });

  it('acepta "true"', () => {
    expect(loadConfig({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
  });
});
