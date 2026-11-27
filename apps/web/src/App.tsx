import { useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { BusinessPage } from './pages/BusinessPage';
import { HomePage } from './pages/HomePage';
import { InvitationPage } from './pages/InvitationPage';
import { LoginPage } from './pages/LoginPage';
import { NewBusinessPage } from './pages/NewBusinessPage';
import { OrdersPage } from './pages/OrdersPage';
import { RegisterPage } from './pages/RegisterPage';
import { StorePage } from './pages/StorePage';
import { TeamPage } from './pages/TeamPage';
import { TrackingPage } from './pages/TrackingPage';
import { getReturnTo, Redirect, usePath, withReturnTo } from './router';
import { isStoreHost, matchStoreRoute } from './store-url';

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}

// Qué pantalla mostrar según la URL y si hay sesión.
function Routes() {
  const { state, refresh } = useAuth();
  const path = usePath();

  // Tienda pública: no depende de la sesión (el cliente no tiene cuenta), así que va primero.
  const store = matchStoreRoute(path, window.location.hostname);
  if (store) {
    return store.token ? <TrackingPage key={store.token} slug={store.slug} token={store.token} /> : <StorePage key={store.slug} slug={store.slug} />;
  }
  // En pedir.* solo existe la tienda: cualquier otra dirección no lleva a ningún lado.
  if (isStoreHost(window.location.hostname)) {
    return (
      <main className="container">
        <h1>No encontramos esta tienda</h1>
        <p>Revisá el link que te pasaron.</p>
      </main>
    );
  }

  if (state.status === 'loading') {
    return (
      <main className="container" aria-busy="true">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  if (state.status === 'error') return <SessionError retry={refresh} />;

  // El link de invitación se abre con o sin sesión.
  const invitationMatch = /^\/invitacion\/([^/]+)$/.exec(path);
  if (invitationMatch) {
    const me = state.status === 'authenticated' ? state.me : null;
    return <InvitationPage key={invitationMatch[1]} token={invitationMatch[1]!} me={me} />;
  }

  if (state.status === 'anonymous') {
    if (path === '/registro') return <RegisterPage />;
    if (path === '/login') return <LoginPage />;
    // Cualquier otra pantalla pide entrar, y después vuelve a donde iba.
    return <Redirect to={path === '/' ? '/login' : withReturnTo('/login', path)} />;
  }

  // Con sesión, login y registro no tienen sentido: van a donde iba (?volver=) o al inicio.
  if (path === '/login' || path === '/registro') return <Redirect to={getReturnTo() ?? '/'} />;
  if (path === '/locales/nuevo') return <NewBusinessPage />;
  // /locales/<id>/menu: el menú. /locales/<id>/equipo: quiénes trabajan e invitaciones.
  const menuMatch = /^\/locales\/([^/]+)\/menu$/.exec(path);
  if (menuMatch) return <BusinessPage key={menuMatch[1]} businessId={menuMatch[1]!} me={state.me} />;
  const teamMatch = /^\/locales\/([^/]+)\/equipo$/.exec(path);
  if (teamMatch) return <TeamPage key={teamMatch[1]} businessId={teamMatch[1]!} me={state.me} />;
  // /locales/<id>: los pedidos (lo que más se usa durante el servicio).
  const businessMatch = /^\/locales\/([^/]+)$/.exec(path);
  if (businessMatch) return <OrdersPage key={businessMatch[1]} businessId={businessMatch[1]!} me={state.me} />;
  if (path !== '/') return <Redirect to="/" />;
  return <HomePage me={state.me} />;
}

function SessionError({ retry }: { retry: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  async function onRetry() {
    setPending(true);
    try {
      await retry();
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="container narrow">
      <h1>Algo salió mal</h1>
      <p role="alert">No pudimos cargar tu sesión. Probá de nuevo en un rato.</p>
      <button type="button" className="button primary" onClick={onRetry} disabled={pending}>
        {pending ? 'Reintentando…' : 'Reintentar'}
      </button>
    </main>
  );
}
