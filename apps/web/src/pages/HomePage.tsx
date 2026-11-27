import type { MeResponse, Role } from '@comanda/shared';
import { useState } from 'react';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { Link } from '../router';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Dueño',
  manager: 'Encargado',
  kitchen: 'Cocina',
  driver: 'Reparto',
};

export function HomePage({ me }: { me: MeResponse }) {
  const { logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function onLogout() {
    setLeaving(true);
    setLogoutError(null);
    try {
      await logout();
    } catch (err) {
      // Si la API no respondió, la sesión sigue abierta en el servidor: no fingimos que
      // se cerró (al recargar volvería a entrar), avisamos para que pruebe de nuevo.
      console.error(err);
      setLogoutError(
        err instanceof ApiError ? err.message : 'No se pudo cerrar la sesión. Probá de nuevo.',
      );
    } finally {
      setLeaving(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">Comanda</span>
        <span className="muted">{me.user.name}</span>
        <button type="button" className="button" onClick={onLogout} disabled={leaving}>
          Cerrar sesión
        </button>
      </header>
      {logoutError && (
        <p role="alert" className="form-error banner">
          {logoutError}
        </p>
      )}

      <main className="container">
        <h1>Tus locales</h1>

        {me.businesses.length === 0 ? (
          <section className="card">
            <h2>Todavía no tenés ningún local</h2>
            <p className="muted">Crealo para cargar el menú y empezar a recibir pedidos.</p>
            <Link to="/locales/nuevo" className="button primary">
              Crear mi local
            </Link>
          </section>
        ) : (
          <>
            <ul className="list" role="list">
              {me.businesses.map((b) => (
                <li key={b.id} className="card">
                  <h2>{b.name}</h2>
                  <p className="muted">pedir.mauroaglr.com/{b.slug}</p>
                  <p>
                    <span className="badge">{ROLE_LABELS[b.role]}</span>
                  </p>
                </li>
              ))}
            </ul>
            <p>
              <Link to="/locales/nuevo" className="button">
                Crear otro local
              </Link>
            </p>
          </>
        )}
      </main>
    </>
  );
}
