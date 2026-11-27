// Código compartido entre la API y la web.
// Un solo esquema define la forma de los datos y lo usan los dos lados,
// así un cambio en la API rompe el build de la web en vez de romper en producción.
export * from './health.js';
export * from './auth.js';
export * from './catalog.js';
export * from './team.js';
export * from './orders.js';
export * from './realtime.js';
