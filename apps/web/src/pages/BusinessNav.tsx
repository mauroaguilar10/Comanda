import type { MeResponse } from '@comanda/shared';
import { canManage } from '../roles';
import { Link } from '../router';

type Business = MeResponse['businesses'][number];

// Encabezado de las pantallas de un local: nombre y pestañas.
// Pedidos y Menú los ve todo el equipo; Equipo, solo dueño y encargado.
export function BusinessNav({ business, current }: { business: Business; current: 'orders' | 'menu' | 'team' }) {
  const base = `/locales/${business.id}`;
  return (
    <>
      <p>
        <Link to="/">← Tus locales</Link>
      </p>
      <h1>{business.name}</h1>
      <nav aria-label="Secciones del local" className="tabs">
        {/* aria-current marca la pestaña activa para los lectores de pantalla. */}
        <Link to={base} aria-current={current === 'orders' ? 'page' : undefined}>
          Pedidos
        </Link>
        <Link to={`${base}/menu`} aria-current={current === 'menu' ? 'page' : undefined}>
          Menú
        </Link>
        {canManage(business.role) && (
          <Link to={`${base}/equipo`} aria-current={current === 'team' ? 'page' : undefined}>
            Equipo
          </Link>
        )}
      </nav>
    </>
  );
}
