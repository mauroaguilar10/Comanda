import { MAX_ITEM_QUANTITY } from '@comanda/shared';
import { useEffect, useState } from 'react';

// El carrito: cuántas unidades de cada producto. Solo ids y cantidades:
// los precios se toman siempre del menú (y el servidor los vuelve a calcular).
export type Cart = Record<string, number>;

export function setQuantity(cart: Cart, productId: string, quantity: number): Cart {
  const next = { ...cart };
  const clamped = Math.min(MAX_ITEM_QUANTITY, Math.max(0, Math.trunc(quantity)));
  if (clamped === 0) delete next[productId];
  else next[productId] = clamped;
  return next;
}

export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((sum, q) => sum + q, 0);
}

interface PricedProduct {
  id: string;
  priceCents: number;
  available: boolean;
}

// Total con los precios del menú. Ignora productos que ya no están o se pausaron.
export function cartTotal(cart: Cart, products: PricedProduct[]): number {
  return Object.entries(cart).reduce((sum, [id, quantity]) => {
    const product = products.find((p) => p.id === id && p.available);
    return product ? sum + product.priceCents * quantity : sum;
  }, 0);
}

// Saca del carrito lo que ya no se puede pedir (el local lo pausó o lo borró).
export function pruneCart(cart: Cart, products: PricedProduct[]): Cart {
  return Object.fromEntries(Object.entries(cart).filter(([id]) => products.some((p) => p.id === id && p.available)));
}

// Guardar en el navegador es una comodidad (si recargás no perdés el pedido), no algo
// de lo que dependamos: en modo incógnito o con el almacenamiento bloqueado puede fallar.
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: el carrito vive solo mientras la página está abierta.
  }
}

// Un carrito por tienda, guardado en el navegador.
export function useCart(slug: string) {
  const key = `comanda:carrito:${slug}`;
  const [cart, setCart] = useState<Cart>(() => readStored<Cart>(key, {}));

  useEffect(() => {
    writeStored(key, Object.keys(cart).length > 0 ? cart : null);
  }, [key, cart]);

  return {
    cart,
    set: (productId: string, quantity: number) => setCart((c) => setQuantity(c, productId, quantity)),
    prune: (products: PricedProduct[]) => setCart((c) => pruneCart(c, products)),
    // Se borra del navegador en el acto, sin esperar al efecto: después de mandar el pedido
    // navegamos al seguimiento, la tienda se desmonta y el efecto ya no llegaría a correr.
    // Sin esto, al volver a la tienda aparecía el pedido anterior en el carrito.
    clear: () => {
      writeStored(key, null);
      setCart({});
    },
  };
}
