// La tienda pública y el panel son la misma app web, pero en producción la tienda vive en
// su propio dominio: pedir.mauroaglr.com/<slug>. En desarrollo (localhost) va en /tienda/<slug>.

export function isStoreHost(hostname: string): boolean {
  return hostname.startsWith('pedir.');
}

const prefixFor = (hostname: string) => (isStoreHost(hostname) ? '' : '/tienda');

// "/tienda/don-mario" -> { slug: 'don-mario' }; "/tienda/don-mario/pedido/abc" -> { slug, token: 'abc' }.
export function matchStoreRoute(path: string, hostname: string): { slug: string; token?: string } | null {
  const prefix = prefixFor(hostname).replace('/', '\\/');
  const match = new RegExp(`^${prefix}\\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\\/pedido\\/([A-Za-z0-9_-]+))?\\/?$`).exec(path);
  if (!match) return null;
  return match[2] ? { slug: match[1]!, token: match[2] } : { slug: match[1]! };
}

// Ruta dentro de la tienda (para navegar sin salir del dominio en que se está).
export function storePath(hostname: string, slug: string, token?: string): string {
  return `${prefixFor(hostname)}/${slug}${token ? `/pedido/${token}` : ''}`;
}

// Link completo a la tienda, para que el dueño lo comparta desde el panel.
// Desde app.mauroaglr.com apunta a pedir.mauroaglr.com; en desarrollo, a /tienda en el mismo sitio.
export function storeUrl(location: { hostname: string; origin: string; protocol: string }, slug: string): string {
  if (location.hostname.startsWith('app.')) {
    return `${location.protocol}//pedir.${location.hostname.slice(4)}/${slug}`;
  }
  return `${location.origin}/tienda/${slug}`;
}
