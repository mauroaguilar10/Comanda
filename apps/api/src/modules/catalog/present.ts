import { productSchema, type ProductResponse } from '@comanda/shared';
import type { Product } from '../../db/schema.js';
import type { FileStorage } from '../../lib/storage.js';

// El producto como lo ve la web: sin businessId ni fechas, y con la URL de la foto
// (en la base guardamos la clave; la URL depende de dónde están guardadas).
// Lo usan el panel (catálogo) y la tienda pública (pedidos).
export function toProductResponse(product: Product, storage: FileStorage): ProductResponse {
  return productSchema.parse({ ...product, imageUrl: product.imageKey ? storage.url(product.imageKey) : null });
}
