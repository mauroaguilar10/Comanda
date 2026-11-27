import type { Fulfillment, OrderStatus, PaymentMethod } from '@comanda/shared';

// Textos de pantalla para los valores de los pedidos.

export const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recibido',
  preparing: 'En preparación',
  ready: 'Listo',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

// El texto del botón que lleva a ese estado. "Entregado" depende del tipo de pedido.
export function actionLabel(to: OrderStatus, fulfillment: Fulfillment): string {
  switch (to) {
    case 'preparing':
      return 'Empezar a preparar';
    case 'ready':
      return 'Marcar listo';
    case 'on_the_way':
      return 'Salió a entregar';
    case 'delivered':
      return fulfillment === 'takeaway' ? 'Lo retiró' : 'Entregado';
    case 'cancelled':
      return 'Cancelar';
    default:
      return STATUS_LABELS[to];
  }
}

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  takeaway: 'Retiro en el local',
  delivery: 'Envío a domicilio',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
};

// hourCycle h23: "19:46", como se lee la hora en un local (no "07:46 p. m.").
const timeFormat = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const formatTime = (date: Date) => timeFormat.format(date);

// "recién", "hace 5 min", "hace 2 h"
export function timeAgo(date: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h`;
}
