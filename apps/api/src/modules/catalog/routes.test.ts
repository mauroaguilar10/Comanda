import { catalogResponseSchema, MAX_IMAGE_BYTES } from '@comanda/shared';
import { describe, expect, it } from 'vitest';
import type { Role } from '../../db/schema.js';
import { buildApp } from '../../app.js';
import { SESSION_COOKIE } from '../../plugins/auth.js';
import { fakeCatalog, fakeMemberships, fakeSessions, fakeStorage, fakeUsers, makeBusiness } from '../../test/fakes.js';

// Dos locales: "Don Mario" (donde trabajan todos) y "Otro" (de otra persona).
async function setup() {
  const users = fakeUsers();
  const sessions = fakeSessions(users.all);
  const donMario = makeBusiness({ name: 'Don Mario', slug: 'don-mario' });
  const otro = makeBusiness({ name: 'Otro', slug: 'otro' });
  const memberships = fakeMemberships([], [donMario, otro]);
  const catalog = fakeCatalog();
  const storage = fakeStorage();
  const app = await buildApp({ users, sessions, memberships, catalog, storage });

  // Crea una persona con ese rol en el local y devuelve el header de su sesión.
  async function as(role: Role, businessId = donMario.id) {
    const user = await users.create({ email: `${role}-${businessId}@example.com`, name: role, passwordHash: 'x' });
    memberships.entries.push({ userId: user.id, businessId, role });
    const { token } = await sessions.create(user.id);
    return { cookie: `${SESSION_COOKIE}=${token}` };
  }

  const base = `/businesses/${donMario.id}`;
  return { app, catalog, storage, donMario, otro, base, as };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

// Atajos para los pedidos que más se repiten.
const post = (ctx: Ctx, headers: { cookie: string }, path: string, payload: object) =>
  ctx.app.inject({ method: 'POST', url: ctx.base + path, headers, payload });

async function createCategory(ctx: Ctx, headers: { cookie: string }, name = 'Pizzas') {
  const res = await post(ctx, headers, '/categories', { name });
  return res.json().id as string;
}

describe('GET /businesses/:businessId/catalog', () => {
  it('devuelve las categorías en orden con sus productos', async () => {
    const ctx = await setup();
    const owner = await ctx.as('owner');
    const pizzas = await createCategory(ctx, owner, 'Pizzas');
    const bebidas = await createCategory(ctx, owner, 'Bebidas');
    await post(ctx, owner, '/products', { categoryId: pizzas, name: 'Muzzarella', priceCents: 900000 });
    await post(ctx, owner, '/products', { categoryId: bebidas, name: 'Coca 1.5L', priceCents: 350000, available: false });

    const res = await ctx.app.inject({ method: 'GET', url: `${ctx.base}/catalog`, headers: owner });

    expect(res.statusCode).toBe(200);
    const body = catalogResponseSchema.parse(res.json());
    expect(body.categories.map((c) => c.name)).toEqual(['Pizzas', 'Bebidas']);
    expect(body.categories[0]!.products).toMatchObject([
      { name: 'Muzzarella', priceCents: 900000, available: true, description: null, imageUrl: null },
    ]);
    expect(body.categories[1]!.products).toMatchObject([{ name: 'Coca 1.5L', available: false }]);
    // Solo campos públicos.
    expect(res.body).not.toContain('businessId');
  });

  it('cocina y reparto pueden ver el menú', async () => {
    const ctx = await setup();
    for (const role of ['kitchen', 'driver'] as const) {
      const res = await ctx.app.inject({ method: 'GET', url: `${ctx.base}/catalog`, headers: await ctx.as(role) });
      expect(res.statusCode).toBe(200);
    }
  });

  it('alguien de otro local no puede ver el menú (403)', async () => {
    const ctx = await setup();
    const ajeno = await ctx.as('owner', ctx.otro.id);

    const res = await ctx.app.inject({ method: 'GET', url: `${ctx.base}/catalog`, headers: ajeno });

    expect(res.statusCode).toBe(403);
  });
});

describe('categorías', () => {
  it('el encargado crea y renombra', async () => {
    const ctx = await setup();
    const manager = await ctx.as('manager');

    const created = await post(ctx, manager, '/categories', { name: '  Empanadas ' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Empanadas', position: 0 });

    const renamed = await ctx.app.inject({
      method: 'PATCH',
      url: `${ctx.base}/categories/${created.json().id}`,
      headers: manager,
      payload: { name: 'Empanadas al horno' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'Empanadas al horno' });
  });

  it('cocina no puede cambiar el menú (403)', async () => {
    const ctx = await setup();

    const res = await post(ctx, await ctx.as('kitchen'), '/categories', { name: 'Pizzas' });

    expect(res.statusCode).toBe(403);
    expect(ctx.catalog.categories).toHaveLength(0);
  });

  it('responde 400 con un nombre vacío', async () => {
    const ctx = await setup();

    const res = await post(ctx, await ctx.as('owner'), '/categories', { name: '   ' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ fields: { name: ['Poné un nombre'] } });
  });

  it('no deja borrar una categoría con productos (409), sí una vacía (204)', async () => {
    const ctx = await setup();
    const owner = await ctx.as('owner');
    const pizzas = await createCategory(ctx, owner, 'Pizzas');
    const vacia = await createCategory(ctx, owner, 'Vacía');
    await post(ctx, owner, '/products', { categoryId: pizzas, name: 'Muzzarella', priceCents: 900000 });

    const conProductos = await ctx.app.inject({ method: 'DELETE', url: `${ctx.base}/categories/${pizzas}`, headers: owner });
    const sinProductos = await ctx.app.inject({ method: 'DELETE', url: `${ctx.base}/categories/${vacia}`, headers: owner });

    expect(conProductos.statusCode).toBe(409);
    expect(conProductos.json()).toMatchObject({ error: 'category_has_products' });
    expect(sinProductos.statusCode).toBe(204);
    expect(ctx.catalog.categories.map((c) => c.name)).toEqual(['Pizzas']);
  });

  it('una categoría de otro local da 404 aunque el id exista', async () => {
    const ctx = await setup();
    const ajena = await createCategory(
      { ...ctx, base: `/businesses/${ctx.otro.id}` },
      await ctx.as('owner', ctx.otro.id),
    );
    const owner = await ctx.as('owner');

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `${ctx.base}/categories/${ajena}`,
      headers: owner,
      payload: { name: 'Hackeada' },
    });

    expect(res.statusCode).toBe(404);
    expect(ctx.catalog.categories[0]!.name).toBe('Pizzas');
  });

  it('un id que no es UUID da 404, no 500', async () => {
    const ctx = await setup();

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `${ctx.base}/categories/no-es-un-id`,
      headers: await ctx.as('owner'),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('productos', () => {
  it('crea, edita y borra', async () => {
    const ctx = await setup();
    const owner = await ctx.as('owner');
    const pizzas = await createCategory(ctx, owner);

    const created = await post(ctx, owner, '/products', {
      categoryId: pizzas,
      name: 'Napolitana',
      description: 'Con tomate y ajo',
      priceCents: 1050000,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const paused = await ctx.app.inject({
      method: 'PATCH',
      url: `${ctx.base}/products/${id}`,
      headers: owner,
      payload: { available: false, description: null },
    });
    expect(paused.json()).toMatchObject({ name: 'Napolitana', available: false, description: null });

    const deleted = await ctx.app.inject({ method: 'DELETE', url: `${ctx.base}/products/${id}`, headers: owner });
    expect(deleted.statusCode).toBe(204);
    expect(ctx.catalog.products).toHaveLength(0);
  });

  it('rechaza precios negativos o con decimales (400)', async () => {
    const ctx = await setup();
    const owner = await ctx.as('owner');
    const pizzas = await createCategory(ctx, owner);

    for (const priceCents of [-100, 99.5, '900']) {
      const res = await post(ctx, owner, '/products', { categoryId: pizzas, name: 'Muzza', priceCents });
      expect(res.statusCode).toBe(400);
    }
    expect(ctx.catalog.products).toHaveLength(0);
  });

  it('no deja crear un producto en una categoría de otro local', async () => {
    const ctx = await setup();
    const ajena = await createCategory(
      { ...ctx, base: `/businesses/${ctx.otro.id}` },
      await ctx.as('owner', ctx.otro.id),
    );

    const res = await post(ctx, await ctx.as('owner'), '/products', {
      categoryId: ajena,
      name: 'Intrusa',
      priceCents: 100,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ fields: { categoryId: ['Esa categoría no existe en este local.'] } });
    expect(ctx.catalog.products).toHaveLength(0);
  });

  it('el encargado de otro local no puede editar ni borrar mis productos', async () => {
    const ctx = await setup();
    const owner = await ctx.as('owner');
    const pizzas = await createCategory(ctx, owner);
    const id = (await post(ctx, owner, '/products', { categoryId: pizzas, name: 'Muzza', priceCents: 100 })).json().id;
    const ajeno = await ctx.as('manager', ctx.otro.id);

    // Usa SU local en la URL (donde sí tiene permiso) pero el id de MI producto.
    const otroBase = `/businesses/${ctx.otro.id}`;
    const edit = await ctx.app.inject({
      method: 'PATCH',
      url: `${otroBase}/products/${id}`,
      headers: ajeno,
      payload: { priceCents: 1 },
    });
    const del = await ctx.app.inject({ method: 'DELETE', url: `${otroBase}/products/${id}`, headers: ajeno });

    expect(edit.statusCode).toBe(404);
    expect(del.statusCode).toBe(404);
    expect(ctx.catalog.products[0]!.priceCents).toBe(100);
  });
});

describe('fotos de productos', () => {
  // Los primeros bytes de cada formato alcanzan para que la API los reconozca.
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

  async function withProduct() {
    const ctx = await setup();
    const owner = await ctx.as('owner');
    const pizzas = await createCategory(ctx, owner);
    const id = (await post(ctx, owner, '/products', { categoryId: pizzas, name: 'Muzza', priceCents: 100 })).json().id as string;
    const upload = (body: Buffer, contentType: string, headers = owner, productId = id) =>
      ctx.app.inject({
        method: 'PUT',
        url: `${ctx.base}/products/${productId}/image`,
        headers: { ...headers, 'content-type': contentType },
        payload: body,
      });
    return { ...ctx, owner, id, upload };
  }

  it('sube la foto, la guarda y devuelve su URL', async () => {
    const { upload, storage, catalog } = await withProduct();

    const res = await upload(webp, 'image/webp');

    expect(res.statusCode).toBe(200);
    const [key] = [...storage.files.keys()];
    expect(key).toMatch(/^products\/.+\.webp$/);
    expect(storage.files.get(key!)?.contentType).toBe('image/webp');
    expect(res.json().imageUrl).toBe(`https://fotos.test/${key}`);
    expect(catalog.products[0]!.imageKey).toBe(key);
  });

  it('reemplazar la foto borra la anterior del almacenamiento', async () => {
    const { upload, storage } = await withProduct();
    await upload(webp, 'image/webp');
    const [first] = [...storage.files.keys()];

    await upload(jpeg, 'image/jpeg');

    const keys = [...storage.files.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe(first);
    expect(keys[0]).toMatch(/\.jpg$/);
  });

  it('rechaza un archivo que dice ser imagen pero no lo es (415)', async () => {
    const { upload, storage } = await withProduct();

    const res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'image/png');

    expect(res.statusCode).toBe(415);
    expect(storage.files.size).toBe(0);
  });

  it('rechaza tipos que no son imágenes (415)', async () => {
    const { upload } = await withProduct();

    const res = await upload(Buffer.from('hola'), 'text/plain');

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ error: 'unsupported_image' });
  });

  it('rechaza fotos de más de 2 MB (413)', async () => {
    const { upload, storage } = await withProduct();
    const huge = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES)]);

    const res = await upload(huge, 'image/jpeg');

    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: 'image_too_large' });
    expect(storage.files.size).toBe(0);
  });

  it('cocina no puede subir fotos (403)', async () => {
    const { upload, as } = await withProduct();

    expect((await upload(webp, 'image/webp', await as('kitchen'))).statusCode).toBe(403);
  });

  it('un producto que no existe da 404 y no deja el archivo guardado', async () => {
    const { upload, storage, owner } = await withProduct();

    const res = await upload(webp, 'image/webp', owner, '00000000-0000-0000-0000-000000000000');

    expect(res.statusCode).toBe(404);
    expect(storage.files.size).toBe(0);
  });

  it('quitar la foto la borra', async () => {
    const { app, base, id, owner, upload, storage } = await withProduct();
    await upload(webp, 'image/webp');

    const res = await app.inject({ method: 'DELETE', url: `${base}/products/${id}/image`, headers: owner });

    expect(res.statusCode).toBe(200);
    expect(res.json().imageUrl).toBeNull();
    expect(storage.files.size).toBe(0);
  });

  it('borrar el producto borra también su foto', async () => {
    const { app, base, id, owner, upload, storage } = await withProduct();
    await upload(webp, 'image/webp');

    await app.inject({ method: 'DELETE', url: `${base}/products/${id}`, headers: owner });

    expect(storage.files.size).toBe(0);
  });
});
