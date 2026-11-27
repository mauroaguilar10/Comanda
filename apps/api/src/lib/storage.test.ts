import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorage, createR2Storage, isValidKey } from './storage.js';

const KEY = 'products/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222-abc_DEF-123.webp';

describe('isValidKey', () => {
  it('acepta las claves que generamos', () => {
    expect(isValidKey(KEY)).toBe(true);
  });

  it.each([
    '../../.env',
    'products/../../.env',
    `${KEY}/../../x`,
    'products/x/y.webp',
    `/${KEY}`,
    KEY.replace('.webp', '.html'),
  ])('rechaza "%s"', (key) => {
    expect(isValidKey(key)).toBe(false);
  });
});

describe('createLocalStorage', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('guarda, lee y borra dentro de su carpeta', async () => {
    dir = await mkdtemp(join(tmpdir(), 'comanda-'));
    const storage = createLocalStorage(dir, 'http://localhost:3000');

    await storage.put(KEY, Buffer.from('foto'), 'image/webp');
    expect((await storage.read(KEY))?.toString()).toBe('foto');
    expect(storage.url(KEY)).toBe(`http://localhost:3000/uploads/${KEY}`);

    await storage.delete(KEY);
    expect(await storage.read(KEY)).toBeNull();
  });

  it('no escribe ni lee con una clave peligrosa', async () => {
    dir = await mkdtemp(join(tmpdir(), 'comanda-'));
    const storage = createLocalStorage(dir, 'http://localhost:3000');

    await expect(storage.put('../escapado.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
    expect(await storage.read('../../package.json')).toBeNull();
  });
});

describe('createR2Storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  const config = {
    accountId: 'cuenta',
    accessKeyId: 'id',
    secretAccessKey: 'secreto',
    bucket: 'fotos',
    publicUrl: 'https://fotos.mauroaglr.com',
  };

  // No tenemos R2 en los tests: interceptamos fetch y miramos qué se mandaría.
  it('sube con PUT firmado al endpoint del bucket', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const storage = createR2Storage(config);

    await storage.put(KEY, Buffer.from('foto'), 'image/webp');

    const request = fetchMock.mock.calls[0]![0] as Request;
    expect(request.method).toBe('PUT');
    expect(request.url).toBe(`https://cuenta.r2.cloudflarestorage.com/fotos/${KEY}`);
    expect(request.headers.get('content-type')).toBe('image/webp');
    // La firma AWS v4 va en este header: sin ella, R2 rechaza el pedido.
    expect(request.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=id\//);
    expect(storage.url(KEY)).toBe(`https://fotos.mauroaglr.com/${KEY}`);
  });

  it('si R2 responde error, tira una excepción', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('AccessDenied', { status: 403 })));
    const storage = createR2Storage(config);

    await expect(storage.put(KEY, Buffer.from('x'), 'image/webp')).rejects.toThrow('403');
  });
});
