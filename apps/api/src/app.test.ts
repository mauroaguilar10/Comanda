import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

// Vitest se usa como JUnit: describe agrupa, it es un caso, expect es el assert.
// vi.fn() crea un mock, como Mockito.mock() + when(...).thenReturn(...).

describe('GET /health', () => {
  it('responde ok cuando no hay base configurada', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'not_configured' });
  });

  it('responde ok cuando la base contesta', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(true);
    const app = await buildApp({ checkDatabase });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('avisa degraded cuando la base no contesta', async () => {
    const app = await buildApp({ checkDatabase: vi.fn().mockResolvedValue(false) });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.json()).toMatchObject({ status: 'degraded', database: 'error' });
  });
});

describe('CORS', () => {
  const WEB = 'https://app.mauroaglr.com';

  // Antes de un POST con JSON desde otro origen, el navegador pregunta con OPTIONS
  // ("preflight") si tiene permiso. Simulamos esa pregunta.
  const preflight = (app: Awaited<ReturnType<typeof buildApp>>, origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });

  it('permite a la web llamar con cookies', async () => {
    const app = await buildApp({ corsOrigins: [WEB] });

    const res = await preflight(app, WEB);

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('no le da permiso a otro sitio', async () => {
    const app = await buildApp({ corsOrigins: [WEB] });

    const res = await preflight(app, 'https://sitio-malo.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sin orígenes configurados no agrega CORS', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: WEB } });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
