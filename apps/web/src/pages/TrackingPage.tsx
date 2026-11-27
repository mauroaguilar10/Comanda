import { clientEvents, serverEvents, trackingResponseSchema, type OrderStatus, type TrackingResponse } from '@comanda/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, request } from '../api';
import { liveLabel, useRealtime } from '../realtime';
import { STATUS_LABELS, formatTime } from '../labels';
import { formatPrice } from '../money';
import { Link } from '../router';
import { storePath } from '../store-url';

// Los cambios llegan al instante (Socket.IO). Por las dudas, igual preguntamos cada minuto.
const POLL_MS = 60_000;

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; order: TrackingResponse };

// Lo que ve el cliente después de pedir. El link (con el token) es su forma de volver acá.
export function TrackingPage({ slug, token }: { slug: string; token: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const order = await request(`/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(token)}`, trackingResponseSchema);
      setState({ status: 'ready', order });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'error', message: 'No encontramos este pedido. Revisá el link.' });
      } else {
        // Un corte de señal no tiene que borrar lo que ya se ve.
        setState((s) => (s.status === 'ready' ? s : { status: 'error', message: 'No pudimos cargar el pedido. Reintentando…' }));
      }
    }
  }, [slug, token]);

  const finished = state.status === 'ready' && (state.order.status === 'delivered' || state.order.status === 'cancelled');

  useEffect(() => {
    void load();
  }, [load]);

  // Red de seguridad mientras el pedido siga en curso.
  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, finished]);

  const live = useRealtime(`order:${token}`, {
    subscribe: (socket) => socket.emitWithAck(clientEvents.trackOrder, { token }),
    onSync: () => void load(),
    handlers: { [serverEvents.orderUpdated]: () => void load() },
  });

  if (state.status === 'loading') {
    return (
      <main className="container narrow" aria-busy="true">
        <p className="muted">Cargando tu pedido…</p>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="container narrow">
        <h1>Tu pedido</h1>
        <p role="alert">{state.message}</p>
      </main>
    );
  }

  const { order } = state;
  const steps: OrderStatus[] =
    order.fulfillment === 'delivery' ? ['received', 'preparing', 'ready', 'on_the_way', 'delivered'] : ['received', 'preparing', 'ready', 'delivered'];
  const current = steps.indexOf(order.status);

  return (
    <main className="container narrow stack">
      <p className="muted">{order.businessName}</p>
      <h1>Pedido #{order.number}</h1>

      {/* role="status": cuando cambia el estado, el lector de pantalla lo anuncia. */}
      <p role="status" className={order.status === 'cancelled' ? 'form-error' : 'status-now'}>
        {statusMessage(order)}
      </p>

      {order.status !== 'cancelled' && (
        <ol className="timeline">
          {steps.map((step, i) => (
            <li
              key={step}
              className={i < current ? 'done' : i === current ? 'current' : undefined}
              aria-current={i === current ? 'step' : undefined}
            >
              {step === 'delivered' && order.fulfillment === 'takeaway' ? 'Retirado' : STATUS_LABELS[step]}
            </li>
          ))}
        </ol>
      )}

      <section aria-labelledby="items-title" className="card stack">
        <h2 id="items-title">Detalle</h2>
        <ul className="order-lines" role="list">
          {order.items.map((item, i) => (
            <li key={i}>
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{formatPrice(item.unitPriceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="order-total">
          <span>Total</span>
          <strong>{formatPrice(order.totalCents)}</strong>
        </p>
        <p className="muted">Pedido a las {formatTime(order.createdAt)}</p>
      </section>

      <p className="hint">
        Guardá esta página: es tu forma de ver cómo va el pedido. Se actualiza sola
        {!finished && <span className={`live live-${live} inline-live`}> {liveLabel(live)}</span>}.
      </p>
      <Link to={storePath(window.location.hostname, slug)}>Volver al menú</Link>
    </main>
  );
}

function statusMessage(order: TrackingResponse): string {
  const takeaway = order.fulfillment === 'takeaway';
  switch (order.status) {
    case 'received':
      return '¡Listo! El local recibió tu pedido.';
    case 'preparing':
      return 'Están preparando tu pedido.';
    case 'ready':
      return takeaway ? 'Tu pedido está listo. Ya podés pasar a retirarlo.' : 'Tu pedido está listo y sale en breve.';
    case 'on_the_way':
      return 'Tu pedido está en camino.';
    case 'delivered':
      return takeaway ? 'Retiraste tu pedido. ¡Que lo disfrutes!' : 'Tu pedido fue entregado. ¡Que lo disfrutes!';
    case 'cancelled':
      return 'El local canceló el pedido. Si tenés dudas, comunicate con ellos.';
  }
}
