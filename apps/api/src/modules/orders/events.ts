import type { Order } from '../../db/schema.js';

// Lo que el módulo de pedidos avisa cuando pasa algo. Las rutas no saben cómo se reparte
// el aviso (hoy Socket.IO; mañana también la cola de eventos para el CRM): solo llaman acá.
export interface OrderEvents {
  created(order: Order): void;
  updated(order: Order): void;
}

// Sin tiempo real (por ejemplo, en tests que no lo necesitan): los avisos no van a ningún lado.
export const noOrderEvents: OrderEvents = {
  created() {},
  updated() {},
};
