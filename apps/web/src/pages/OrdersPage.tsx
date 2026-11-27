import {
  ACTIVE_STATUSES,
  canChangeStatus,
  clientEvents,
  orderCreatedEventSchema,
  serverEvents,
  nextStatuses,
  ordersResponseSchema,
  storeSettingsSchema,
  type MeResponse,
  type OrderResponse,
  type OrderStatus,
  type Role,
} from '@comanda/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, request } from '../api';
import { FULFILLMENT_LABELS, PAYMENT_LABELS, STATUS_LABELS, actionLabel, formatTime, timeAgo } from '../labels';
import { formatPrice } from '../money';
import { liveLabel, useRealtime } from '../realtime';
import { canManage } from '../roles';
import { Redirect } from '../router';
import { enableSound, playNewOrder, soundEnabled } from '../sound';
import { storeUrl } from '../store-url';
import { BusinessNav } from './BusinessNav';

// Los cambios llegan al instante por Socket.IO. Igual consultamos cada minuto como red de
// seguridad: si algo falla en la conexión, el panel nunca queda más de un minuto atrasado.
const POLL_MS = 60_000;
// Cuánto tiempo se resalta un pedido recién llegado.
const FRESH_MS = 60_000;

const SECTION_TITLES: Partial<Record<OrderStatus, string>> = {
  received: 'Nuevos',
  preparing: 'En preparación',
  ready: 'Listos',
  on_the_way: 'En camino',
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; orders: OrderResponse[] };

// Panel de pedidos: lo que usa el local durante el servicio.
export function OrdersPage({ businessId, me }: { businessId: string; me: MeResponse }) {
  const business = me.businesses.find((b) => b.id === businessId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // Pedidos que llegaron mientras mirábamos: se resaltan un rato.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState(soundEnabled());
  const base = `/businesses/${businessId}`;

  const reload = useCallback(async () => {
    try {
      const [{ orders }, settings] = await Promise.all([
        request(`${base}/orders`, ordersResponseSchema),
        request(`${base}/store-settings`, storeSettingsSchema),
      ]);
      setState({ status: 'ready', orders });
      setAccepting(settings.acceptingOrders);
    } catch (err) {
      // Si ya había pedidos en pantalla, un corte momentáneo no los borra.
      setState((s) =>
        s.status === 'ready' ? s : { status: 'error', message: err instanceof ApiError ? err.message : 'No pudimos cargar los pedidos.' },
      );
    }
  }, [base]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), POLL_MS);
    // Al volver a la pestaña (por ejemplo, después de usar otra app en la tablet), actualiza ya.
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const live = useRealtime(`business:${businessId}`, {
    subscribe: (socket) => socket.emitWithAck(clientEvents.joinBusiness, { businessId }),
    onSync: () => void reload(),
    handlers: {
      [serverEvents.orderCreated]: (payload) => {
        const event = orderCreatedEventSchema.safeParse(payload);
        if (!event.success) return;
        playNewOrder();
        setFresh((f) => new Set(f).add(event.data.orderId));
        setTimeout(() => setFresh((f) => {
          const next = new Set(f);
          next.delete(event.data.orderId);
          return next;
        }), FRESH_MS);
        void reload();
      },
      [serverEvents.orderUpdated]: () => void reload(),
    },
  });

  // El título de la pestaña muestra cuántos pedidos nuevos esperan: se ve aunque
  // la tablet esté en otra pestaña.
  const waiting = state.status === 'ready' ? state.orders.filter((o) => o.status === 'received').length : 0;
  useEffect(() => {
    const previous = document.title;
    document.title = waiting > 0 ? `(${waiting}) Pedidos nuevos · Comanda` : 'Pedidos · Comanda';
    return () => {
      document.title = previous;
    };
  }, [waiting]);

  if (!business) return <Redirect to="/" />;

  async function move(order: OrderResponse, to: OrderStatus) {
    if (to === 'cancelled' && !window.confirm(`¿Cancelar el pedido #${order.number} de ${order.customerName}?`)) return;
    setNotice(null);
    try {
      await request(`${base}/orders/${order.id}`, null, { method: 'PATCH', body: { from: order.status, status: to } });
      setNotice({ kind: 'ok', text: `Pedido #${order.number}: ${STATUS_LABELS[to].toLowerCase()}.` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'No se pudo cambiar el pedido. Probá de nuevo.' });
    }
    await reload();
  }

  async function toggleStore() {
    if (accepting === null) return;
    try {
      const settings = await request(`${base}/store-settings`, storeSettingsSchema, {
        method: 'PATCH',
        body: { acceptingOrders: !accepting },
      });
      setAccepting(settings.acceptingOrders);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'No se pudo cambiar la tienda.' });
    }
  }

  const link = storeUrl(window.location, business.slug);

  return (
    // wide: en la tablet del mostrador entran dos columnas de pedidos.
    <main className="container wide">
      <BusinessNav business={business} current="orders" />

      <section aria-label="Tienda" className={accepting === false ? 'store-status closed' : 'store-status'}>
        <p>
          {accepting === null ? 'Cargando…' : accepting ? 'La tienda está abierta: entran pedidos.' : 'La tienda está cerrada: no entran pedidos.'}
          <br />
          <a href={link} target="_blank" rel="noreferrer">
            {link.replace(/^https?:\/\//, '')}
          </a>
        </p>
        {canManage(business.role) && accepting !== null && (
          <button type="button" className={accepting ? 'button' : 'button primary'} onClick={() => void toggleStore()}>
            {accepting ? 'Cerrar la tienda' : 'Abrir la tienda'}
          </button>
        )}
      </section>

      <div className="live-bar">
        {/* role="status": el lector de pantalla avisa si se corta la conexión. */}
        <p role="status" className={`live live-${live}`}>
          {liveLabel(live)}
        </p>
        {sound ? (
          <p className="muted">🔔 Sonido activado</p>
        ) : (
          // El navegador no deja sonar hasta que la persona toca algo: por eso este botón.
          <button type="button" className="button small" onClick={() => void enableSound().then((ok) => setSound(ok))}>
            🔔 Activar sonido de pedidos nuevos
          </button>
        )}
      </div>

      <div aria-live="polite">
        {notice && <p className={notice.kind === 'ok' ? 'notice' : 'form-error'}>{notice.text}</p>}
      </div>

      {state.status === 'loading' && <p className="muted">Cargando pedidos…</p>}
      {state.status === 'error' && (
        <p role="alert" className="form-error">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.orders.length === 0 && (
        <p className="empty-orders muted">No hay pedidos en curso. Cuando entre uno, aparece acá al instante.</p>
      )}
      {state.status === 'ready' &&
        ACTIVE_STATUSES.map((status) => {
          const orders = state.orders.filter((o) => o.status === status);
          if (orders.length === 0) return null;
          return (
            <section key={status} aria-labelledby={`section-${status}`} className="orders-section">
              <h2 id={`section-${status}`}>
                {SECTION_TITLES[status]} <span className="count">{orders.length}</span>
              </h2>
              <ul className="list" role="list">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    role={business.role}
                    fresh={fresh.has(order.id) && order.status === 'received'}
                    onMove={(to) => void move(order, to)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
    </main>
  );
}

function OrderCard({
  order,
  role,
  fresh,
  onMove,
}: {
  order: OrderResponse;
  role: Role;
  fresh: boolean;
  onMove: (to: OrderStatus) => void;
}) {
  // Solo los botones que esta persona puede usar (la API igual lo vuelve a chequear).
  const actions = nextStatuses(order.status, order.fulfillment).filter((to) => canChangeStatus(role, order.status, to, order.fulfillment));
  const advance = actions.filter((a) => a !== 'cancelled');

  return (
    <li className={fresh ? 'card order-card fresh' : 'card order-card'}>
      <div className="order-head">
        <h3>
          #{order.number} · {order.customerName}
          {fresh && <span className="badge fresh-badge">Nuevo</span>}
        </h3>
        <p className="muted">
          {formatTime(order.createdAt)} · {timeAgo(order.createdAt)}
        </p>
      </div>
      <p>
        <span className="badge">{FULFILLMENT_LABELS[order.fulfillment]}</span> <span className="badge">{PAYMENT_LABELS[order.paymentMethod]}</span>
      </p>
      {order.address && <p>📍 {order.address}</p>}
      <p>
        {/* tel: abre el marcador del teléfono */}
        <a href={`tel:${order.customerPhone.replace(/[^\d+]/g, '')}`}>{order.customerPhone}</a>
      </p>
      <ul className="order-items" role="list">
        {order.items.map((item, i) => (
          <li key={i}>
            <strong>{item.quantity} ×</strong> {item.name}
          </li>
        ))}
      </ul>
      {order.notes && <p className="order-notes">“{order.notes}”</p>}
      <p className="order-total">
        <span>Total</span>
        <strong>{formatPrice(order.totalCents)}</strong>
      </p>
      {actions.length > 0 && (
        <div className="actions">
          {advance.map((to) => (
            <button key={to} type="button" className="button primary" onClick={() => onMove(to)} aria-label={`${actionLabel(to, order.fulfillment)}: pedido #${order.number}`}>
              {actionLabel(to, order.fulfillment)}
            </button>
          ))}
          {actions.includes('cancelled') && (
            <button type="button" className="button danger" onClick={() => onMove('cancelled')} aria-label={`Cancelar el pedido #${order.number}`}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </li>
  );
}
