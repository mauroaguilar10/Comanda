import { AuthProvider, useAuth } from './auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NewBusinessPage } from './pages/NewBusinessPage';
import { RegisterPage } from './pages/RegisterPage';
import { Redirect, usePath } from './router';

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}

// Qué pantalla mostrar según la URL y si hay sesión.
function Routes() {
  const { state } = useAuth();
  const path = usePath();

  if (state.status === 'loading') {
    return (
      <main className="container" aria-busy="true">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  if (state.status === 'anonymous') {
    if (path === '/registro') return <RegisterPage />;
    if (path !== '/login') return <Redirect to="/login" />;
    return <LoginPage />;
  }

  // Con sesión, login y registro no tienen sentido: van al inicio.
  if (path === '/login' || path === '/registro') return <Redirect to="/" />;
  if (path === '/locales/nuevo') return <NewBusinessPage />;
  if (path !== '/') return <Redirect to="/" />;
  return <HomePage me={state.me} />;
}
