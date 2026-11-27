import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

// Vitest se usa como JUnit: describe agrupa, it es un caso, expect es el assert.
// vi.fn() crea un mock, como Mockito.mock() + when(...).thenReturn(...).

describe('GET /health', () => {
  it('responde ok cuando no hay base configurada', async () => {
    const app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'not_configured' });
  });

  it('responde ok cuando la base contesta', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(true);
    const app = buildApp({ checkDatabase });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('avisa degraded cuando la base no contesta', async () => {
    const app = buildApp({ checkDatabase: vi.fn().mockResolvedValue(false) });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.json()).toMatchObject({ status: 'degraded', database: 'error' });
  });
});
