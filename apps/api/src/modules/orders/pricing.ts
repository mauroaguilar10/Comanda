import type { CreateOrderInput } from '@comanda/shared';

// Un producto del catálogo, con lo que hace falta para cobrarlo.
export interface PricedProduct {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
}

export interface OrderLine {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

// Algún producto no existe en este local o está pausado. Llevamos los nombres
// (o "un producto" si no existe) para que la tienda le diga al cliente cuáles sacar.
export class ProductsUnavailableError extends Error {
  constructor(readonly names: string[]) {
    super('Hay productos que no se pueden pedir');
    this.name = 'ProductsUnavailableError';
  }
}

// Arma las líneas del pedido con los precios ACTUALES del catálogo, nunca con los que
// mande el navegador. Junta repetidos ("2 muzza" + "1 muzza" = "3 muzza").
export function priceOrder(
  items: CreateOrderInput['items'],
  catalog: PricedProduct[],
): { lines: OrderLine[]; totalCents: number } {
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  const unavailable: string[] = [];
  const lines: OrderLine[] = [];
  for (const [productId, quantity] of quantities) {
    const product = catalog.find((p) => p.id === productId);
    if (!product || !product.available) {
      unavailable.push(product?.name ?? 'un producto que ya no está en el menú');
      continue;
    }
    lines.push({ productId, name: product.name, unitPriceCents: product.priceCents, quantity });
  }
  if (unavailable.length > 0) throw new ProductsUnavailableError(unavailable);

  const totalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  return { lines, totalCents };
}
