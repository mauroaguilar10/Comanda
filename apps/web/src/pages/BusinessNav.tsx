import type { MeResponse } from '@comanda/shared';
import { canManage } from '../roles';
import { Link } from '../router';

type Business = MeResponse['businesses'][number];

// Encabezado de las pantallas de un local: nombre y pestañas Menú / Equipo.
export function BusinessNav({ business, current }: { business: Business; current: 'menu' | 'team' }) {
  return (
    <>
      <p>
        <Link to="/">← Tus locales</Link>
      </p>
      <h1>{business.name}</h1>
      {canManage(business.role) && (
        <nav aria-label="Secciones del local" className="tabs">
          {/* aria-current marca la pestaña activa para los lectores de pantalla. */}
          <Link to={`/locales/${business.id}`} aria-current={current === 'menu' ? 'page' : undefined}>
            Menú
          </Link>
          <Link to={`/locales/${business.id}/equipo`} aria-current={current === 'team' ? 'page' : undefined}>
            Equipo
          </Link>
        </nav>
      )}
    </>
  );
}
