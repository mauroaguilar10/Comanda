import { describe, expect, it } from 'vitest';
import { loadConfig, r2Config } from './config.js';

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

describe('r2Config', () => {
  const all = {
    R2_ACCOUNT_ID: 'cuenta',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secreto',
    R2_BUCKET: 'fotos',
    R2_PUBLIC_URL: 'https://fotos.mauroaglr.com/',
  };

  it('sin ninguna variable usa el disco (null)', () => {
    expect(r2Config(loadConfig({}))).toBeNull();
  });

  it('con todas arma la configuración (sin la barra final de la URL)', () => {
    expect(r2Config(loadConfig(all))).toMatchObject({ bucket: 'fotos', publicUrl: 'https://fotos.mauroaglr.com' });
  });

  it('con algunas sí y otras no, no arranca', () => {
    const { R2_BUCKET: _, ...missingOne } = all;
    expect(() => r2Config(loadConfig(missingOne))).toThrow('Faltan variables de R2');
  });
});
