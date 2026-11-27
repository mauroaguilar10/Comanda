import type { MeResponse, Role } from '@comanda/shared';
import { useState } from 'react';
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

  async function onLogout() {
    setLeaving(true);
    try {
      await logout();
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
