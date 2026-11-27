import {
  createdOrderResponseSchema,
  createOrderInputSchema,
  storeResponseSchema,
  type Fulfillment,
  type ProductResponse,
  type StoreResponse,
} from '@comanda/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, request } from '../api';
import { cartCount, cartTotal, readStored, useCart, writeStored, type Cart } from '../cart';
import { Field, FormError, formValues, issuesToFieldErrors, useFormSubmit } from '../forms';
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from '../labels';
import { formatPrice } from '../money';
import { navigate } from '../router';
import { storePath } from '../store-url';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; store: StoreResponse };

// Tienda pública: el cliente ve el menú, arma el pedido y lo manda. Sin cuenta.
export function StorePage({ slug }: { slug: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [step, setStep] = useState<'menu' | 'checkout'>('menu');
  const { cart, set, prune, clear } = useCart(slug);

  const load = useCallback(async () => {
    try {
      const store = await request(`/store/${encodeURIComponent(slug)}`, storeResponseSchema);
      setState({ status: 'ready', store });
      return store;
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError && err.status === 404 ? 'No encontramos esta tienda.' : 'No pudimos cargar el menú. Probá de nuevo.',
      });
      return null;
    }
  }, [slug]);

  useEffect(() => {
    void load().then((store) => {
      // Si quedó algo en el carrito de otra visita que ya no se vende, lo sacamos.
      if (store) prune(store.categories.flatMap((c) => c.products));
    });
    // Solo depende de load (cambia con el slug). prune se recrea en cada render pero hace
    // siempre lo mismo: si lo pusiéramos acá, recargaría el menú en cada render.
  }, [load]);

  const products = useMemo(() => (state.status === 'ready' ? state.store.categories.flatMap((c) => c.products) : []), [state]);

  if (state.status === 'loading') {
    return (
      <main className="container" aria-busy="true">
        <p className="muted">Cargando el menú…</p>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="container">
        <h1>Ups</h1>
        <p role="alert">{state.message}</p>
      </main>
    );
  }

  const { store } = state;
  const count = cartCount(cart);
  const total = cartTotal(cart, products);

  if (step === 'checkout' && count > 0) {
    return (
      <Checkout
        slug={slug}
        store={store}
        cart={cart}
        products={products}
        total={total}
        setQuantity={set}
        onBack={() => setStep('menu')}
        onSent={(token) => {
          clear();
          navigate(storePath(window.location.hostname, slug, token));
        }}
        onUnavailable={async () => {
          // El menú cambió mientras armaba el pedido: lo recargamos y sacamos lo que ya no está.
          const fresh = await load();
          if (fresh) prune(fresh.categories.flatMap((c) => c.products));
        }}
      />
    );
  }

  return (
    <>
      <main className={count > 0 ? 'container with-cart-bar' : 'container'}>
        <header className="store-header">
          <h1>{store.business.name}</h1>
          {(store.business.address || store.business.phone) && (
            <p className="muted">{[store.business.address, store.business.phone].filter(Boolean).join(' · ')}</p>
          )}
        </header>

        {!store.acceptingOrders && (
          <p role="status" className="closed-banner">
            En este momento el local no está tomando pedidos. Podés mirar el menú.
          </p>
        )}

        {store.categories.length === 0 && <p className="muted">Este local todavía no cargó su menú.</p>}

        {store.categories.map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`} className="store-category">
            <h2 id={`cat-${category.id}`}>{category.name}</h2>
            <ul className="products" role="list">
              {category.products.map((product) => (
                <StoreProduct
                  key={product.id}
                  product={product}
                  quantity={cart[product.id] ?? 0}
                  canOrder={store.acceptingOrders}
                  setQuantity={(q) => set(product.id, q)}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>

      {count > 0 && store.acceptingOrders && (
        // Barra fija abajo, donde llega el pulgar. Siempre muestra cuánto va el pedido.
        <div className="cart-bar">
          <button type="button" className="button primary cart-bar-button" onClick={() => setStep('checkout')}>
            <span>
              Ver mi pedido · {count} {count === 1 ? 'producto' : 'productos'}
            </span>
            <span>{formatPrice(total)}</span>
          </button>
        </div>
      )}
    </>
  );
}

function StoreProduct({
  product,
  quantity,
  canOrder,
  setQuantity,
}: {
  product: ProductResponse;
  quantity: number;
  canOrder: boolean;
  setQuantity: (quantity: number) => void;
}) {
  return (
    <li className={product.available ? 'product store-product' : 'product store-product paused'}>
      <div className="product-main">
        {product.imageUrl && (
          <img className="product-thumb" src={product.imageUrl} alt="" width={72} height={72} loading="lazy" />
        )}
        <div className="product-info">
          <h3>{product.name}</h3>
          {product.description && <p className="muted">{product.description}</p>}
          <p>
            <strong>{formatPrice(product.priceCents)}</strong>
            {!product.available && <span className="badge paused-badge">Sin stock</span>}
          </p>
        </div>
      </div>
      {product.available && canOrder && (
        <div className="actions">
          {quantity === 0 ? (
            <button type="button" className="button" onClick={() => setQuantity(1)} aria-label={`Agregar ${product.name}`}>
              Agregar
            </button>
          ) : (
            <Stepper name={product.name} quantity={quantity} setQuantity={setQuantity} />
          )}
        </div>
      )}
    </li>
  );
}

// − 2 + con nombres claros para el lector de pantalla ("Sacar una Muzzarella").
function Stepper({ name, quantity, setQuantity }: { name: string; quantity: number; setQuantity: (q: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label={`Cantidad de ${name}`}>
      <button type="button" className="button" onClick={() => setQuantity(quantity - 1)} aria-label={`Sacar una ${name}`}>
        −
      </button>
      {/* aria-live: cuando cambia el número, el lector de pantalla lo anuncia. */}
      <span aria-live="polite" className="stepper-value">
        {quantity}
      </span>
      <button type="button" className="button" onClick={() => setQuantity(quantity + 1)} aria-label={`Agregar otra ${name}`}>
        +
      </button>
    </div>
  );
}

// Datos del cliente que recordamos en este navegador para la próxima vez.
interface SavedCustomer {
  customerName: string;
  customerPhone: string;
  address: string;
}
const CUSTOMER_KEY = 'comanda:cliente';

function Checkout({
  slug,
  store,
  cart,
  products,
  total,
  setQuantity,
  onBack,
  onSent,
  onUnavailable,
}: {
  slug: string;
  store: StoreResponse;
  cart: Cart;
  products: ProductResponse[];
  total: number;
  setQuantity: (productId: string, quantity: number) => void;
  onBack: () => void;
  onSent: (trackingToken: string) => void;
  onUnavailable: () => Promise<void>;
}) {
  const saved = readStored<SavedCustomer | null>(CUSTOMER_KEY, null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('takeaway');

  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const values = formValues(form);
    const parsed = createOrderInputSchema.safeParse({
      items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      fulfillment: values.fulfillment,
      address: values.address || undefined,
      paymentMethod: values.paymentMethod,
      notes: values.notes || undefined,
    });
    if (!parsed.success) return issuesToFieldErrors(parsed);

    try {
      const created = await request(`/store/${encodeURIComponent(slug)}/orders`, createdOrderResponseSchema, {
        method: 'POST',
        body: parsed.data,
      });
      writeStored(CUSTOMER_KEY, {
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        address: parsed.data.address ?? saved?.address ?? '',
      } satisfies SavedCustomer);
      onSent(created.trackingToken);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'products_unavailable') await onUnavailable();
      throw err;
    }
  });

  const lines = Object.entries(cart).flatMap(([id, quantity]) => {
    const product = products.find((p) => p.id === id);
    return product ? [{ product, quantity }] : [];
  });

  return (
    <main className="container narrow">
      <p>
        <button type="button" className="link-button" onClick={onBack}>
          ← Seguir mirando el menú
        </button>
      </p>
      <h1>Tu pedido en {store.business.name}</h1>

      <section aria-labelledby="summary-title" className="card stack">
        <h2 id="summary-title" className="visually-hidden">
          Resumen
        </h2>
        <ul className="order-lines" role="list">
          {lines.map(({ product, quantity }) => (
            <li key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <p className="muted">{formatPrice(product.priceCents * quantity)}</p>
              </div>
              <Stepper name={product.name} quantity={quantity} setQuantity={(q) => setQuantity(product.id, q)} />
            </li>
          ))}
        </ul>
        <p className="order-total">
          <span>Total</span>
          <strong>{formatPrice(total)}</strong>
        </p>
      </section>

      <form onSubmit={handleSubmit} noValidate className="stack checkout-form">
        <FormError message={formError} />
        <Field
          name="customerName"
          label="Tu nombre"
          autoComplete="name"
          required
          defaultValue={saved?.customerName}
          error={fieldErrors.customerName}
        />
        <Field
          name="customerPhone"
          label="Teléfono"
          type="tel"
          autoComplete="tel"
          required
          defaultValue={saved?.customerPhone}
          hint="Por si el local necesita avisarte algo."
          error={fieldErrors.customerPhone}
        />

        <fieldset className="choice-group">
          <legend>¿Cómo lo recibís?</legend>
          {(['takeaway', 'delivery'] as const).map((f) => (
            <label key={f} className="choice">
              <input type="radio" name="fulfillment" value={f} checked={fulfillment === f} onChange={() => setFulfillment(f)} />
              {f === 'takeaway' ? 'Lo retiro en el local' : 'Envío a domicilio'}
            </label>
          ))}
        </fieldset>
        {fulfillment === 'delivery' && (
          <Field
            name="address"
            label="Dirección de entrega"
            autoComplete="street-address"
            required
            defaultValue={saved?.address}
            hint="Calle, número y, si hace falta, piso o referencia."
            error={fieldErrors.address}
          />
        )}

        <fieldset className="choice-group">
          <legend>¿Cómo pagás?</legend>
          {(['cash', 'transfer'] as const).map((m, i) => (
            <label key={m} className="choice">
              <input type="radio" name="paymentMethod" value={m} defaultChecked={i === 0} />
              {PAYMENT_LABELS[m]}
            </label>
          ))}
          <p className="hint">Se paga al recibir o retirar el pedido.</p>
        </fieldset>

        <Field name="notes" label="Aclaraciones (opcional)" placeholder="Ej.: sin cebolla, timbre B" error={fieldErrors.notes} />

        <button type="submit" className="button primary" disabled={pending}>
          {pending ? 'Enviando…' : `Confirmar pedido · ${formatPrice(total)}`}
        </button>
        <p className="hint">
          {FULFILLMENT_LABELS[fulfillment]}. El local recibe el pedido al instante y vas a poder seguirlo desde esta página.
        </p>
      </form>
    </main>
  );
}
