import { acceptInvitationResponseSchema, invitationPreviewSchema, type InvitationPreview, type MeResponse } from '@comanda/shared';
import { useEffect, useState } from 'react';
import { ApiError, request } from '../api';
import { useAuth } from '../auth';
import { FormError } from '../forms';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../roles';
import { Link, navigate, withReturnTo } from '../router';

type LoadState = { status: 'loading' } | { status: 'invalid'; message: string } | { status: 'ready'; preview: InvitationPreview };

// Lo que ve quien abre el link de invitación. Funciona con y sin sesión:
// sin sesión ofrece crear la cuenta (o entrar) y vuelve acá después.
export function InvitationPage({ token, me }: { token: string; me: MeResponse | null }) {
  const { refresh, logout } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/invitacion/${token}`;

  useEffect(() => {
    request(`/invitations/${encodeURIComponent(token)}`, invitationPreviewSchema)
      .then((preview) => setState({ status: 'ready', preview }))
      .catch((err: unknown) =>
        setState({
          status: 'invalid',
          message: err instanceof ApiError && err.status !== 404 ? err.message : 'Esta invitación no existe, ya se usó o venció.',
        }),
      );
  }, [token]);

  if (state.status === 'loading') {
    return (
      <main className="container narrow" aria-busy="true">
        <p className="muted">Cargando la invitación…</p>
      </main>
    );
  }

  if (state.status === 'invalid') {
    return (
      <main className="container narrow">
        <h1>Invitación no válida</h1>
        <p role="alert">{state.message}</p>
        <p className="muted">Pedile al local que te mande una nueva.</p>
        <Link to="/">Ir al inicio</Link>
      </main>
    );
  }

  const { preview } = state;

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const { businessId } = await request(`/invitations/${encodeURIComponent(token)}/accept`, acceptInvitationResponseSchema, {
        method: 'POST',
      });
      // El local nuevo tiene que aparecer en la sesión antes de entrar a su pantalla.
      await refresh();
      navigate(`/locales/${businessId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Algo salió mal. Probá de nuevo.');
      setPending(false);
    }
  }

  return (
    <main className="container narrow stack">
      <h1>Te invitaron a {preview.businessName}</h1>
      <p>
        Rol: <strong>{ROLE_LABELS[preview.role]}</strong>. {ROLE_DESCRIPTIONS[preview.role]}
      </p>

      {me === null && (
        <>
          <p>
            La invitación es para <strong>{preview.email}</strong>. Creá tu cuenta con ese email, o entrá si ya tenés una.
          </p>
          <Link to={withReturnTo('/registro', here, { email: preview.email })} className="button primary">
            Crear mi cuenta
          </Link>
          <Link to={withReturnTo('/login', here, { email: preview.email })} className="button">
            Ya tengo cuenta
          </Link>
        </>
      )}

      {me !== null && me.user.email !== preview.email && (
        <>
          <p role="alert" className="form-error">
            Esta invitación es para {preview.email}, pero entraste como {me.user.email}.
          </p>
          <button type="button" className="button" onClick={() => void logout()}>
            Cerrar sesión y entrar con otra cuenta
          </button>
        </>
      )}

      {me !== null && me.user.email === preview.email && (
        <>
          <FormError message={error} />
          <button type="button" className="button primary" onClick={() => void accept()} disabled={pending}>
            {pending ? 'Sumándote…' : `Sumarme a ${preview.businessName}`}
          </button>
        </>
      )}
    </main>
  );
}
