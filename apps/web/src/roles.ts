import type { Role } from '@comanda/shared';

// Cómo se muestra cada rol en pantalla.
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Dueño',
  manager: 'Encargado',
  kitchen: 'Cocina',
  driver: 'Reparto',
};

// Qué puede hacer cada rol, para explicarlo al invitar.
export const ROLE_DESCRIPTIONS: Record<Exclude<Role, 'owner'>, string> = {
  manager: 'Maneja el menú, los pedidos y puede invitar a cocina y reparto.',
  kitchen: 'Ve los pedidos para prepararlos y el menú.',
  driver: 'Ve los pedidos para entregar.',
};

export const canManage = (role: Role) => role === 'owner' || role === 'manager';
