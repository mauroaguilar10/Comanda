import { useEffect, useState } from 'react';
import { healthResponseSchema, type HealthResponse } from '@comanda/shared';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'error'; message: string };

// Pantalla de prueba de la etapa 0: muestra si la web llega a la API
// y si la API llega a la base. En la etapa 1 la reemplaza el login.
export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: unknown) => setState({ kind: 'ready', health: healthResponseSchema.parse(data) }))
      .catch(() => setState({ kind: 'error', message: 'No se pudo conectar con la API.' }));
  }, []);

  return (
    <main className="container">
      <h1>Comanda</h1>
      <p className="lead">Pedidos en tiempo real para tu negocio.</p>

      <section aria-live="polite" className="status">
        <h2>Estado del sistema</h2>
        {state.kind === 'loading' && <p>Consultando la API…</p>}
        {state.kind === 'error' && <p className="bad">{state.message}</p>}
        {state.kind === 'ready' && (
          <dl>
            <dt>API</dt>
            <dd className={state.health.status === 'ok' ? 'good' : 'bad'}>{state.health.status}</dd>
            <dt>Base de datos</dt>
            <dd className={state.health.database === 'ok' ? 'good' : 'bad'}>{state.health.database}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
