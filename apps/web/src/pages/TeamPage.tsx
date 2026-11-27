import {
  createdInvitationSchema,
  invitationInputSchema,
  teamResponseSchema,
  type CreatedInvitation,
  type InvitableRole,
  type MeResponse,
  type TeamResponse,
} from '@comanda/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, request } from '../api';
import { Field, FormError, formValues, issuesToFieldErrors, SelectField, useFormSubmit } from '../forms';
import { canManage, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../roles';
import { Redirect } from '../router';
import { BusinessNav } from './BusinessNav';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; team: TeamResponse };

const dateFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });

// Equipo del local: quiénes trabajan, invitaciones pendientes e invitar gente nueva.
// La ven dueño y encargado (la API devuelve 403 al resto).
export function TeamPage({ businessId, me }: { businessId: string; me: MeResponse }) {
  const business = me.businesses.find((b) => b.id === businessId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // La invitación recién creada: es el único momento en que tenemos el link.
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const base = `/businesses/${businessId}`;

  const reload = useCallback(async () => {
    try {
      setState({ status: 'ready', team: await request(`${base}/team`, teamResponseSchema) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'No pudimos cargar el equipo.' });
    }
  }, [base]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!business || !canManage(business.role)) return <Redirect to="/" />;
  const isOwner = business.role === 'owner';

  async function run(action: () => Promise<unknown>, okText: string) {
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'ok', text: okText });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Algo salió mal. Probá de nuevo.' });
    }
    await reload();
  }

  return (
    <main className="container">
      <BusinessNav business={business} current="team" />

      <div aria-live="polite">
        {notice && <p className={notice.kind === 'ok' ? 'notice' : 'form-error'}>{notice.text}</p>}
      </div>

      <section aria-labelledby="invite-title" className="card stack">
        <h2 id="invite-title">Invitar a alguien</h2>
        <InviteForm
          base={base}
          isOwner={isOwner}
          onCreated={async (invitation) => {
            setCreated(invitation);
            setNotice(null);
            await reload();
          }}
        />
        {created && <InvitationLink invitation={created} businessName={business.name} onClose={() => setCreated(null)} />}
      </section>

      {state.status === 'loading' && <p className="muted">Cargando el equipo…</p>}
      {state.status === 'error' && (
        <p role="alert" className="form-error">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <section aria-labelledby="members-title">
            <h2 id="members-title">Quiénes trabajan acá</h2>
            <ul className="list" role="list">
              {state.team.members.map((m) => (
                <li key={m.userId} className="card member">
                  <div>
                    <h3>
                      {m.name}
                      {m.userId === me.user.id && <span className="muted"> (vos)</span>}
                    </h3>
                    <p className="muted">{m.email}</p>
                    <span className="badge">{ROLE_LABELS[m.role]}</span>
                  </div>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      type="button"
                      className="button small danger"
                      aria-label={`Sacar a ${m.name} del equipo`}
                      onClick={() => {
                        if (window.confirm(`¿Sacar a ${m.name} del equipo? Va a dejar de ver el local en el momento.`)) {
                          void run(() => request(`${base}/members/${m.userId}`, null, { method: 'DELETE' }), `${m.name} ya no está en el equipo.`);
                        }
                      }}
                    >
                      Sacar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {state.team.invitations.length > 0 && (
            <section aria-labelledby="pending-title">
              <h2 id="pending-title">Invitaciones pendientes</h2>
              <p className="muted">Si alguien perdió el link, invitalo de nuevo: el anterior deja de funcionar.</p>
              <ul className="list" role="list">
                {state.team.invitations.map((i) => (
                  <li key={i.id} className="card member">
                    <div>
                      <h3>{i.email}</h3>
                      <p className="muted">
                        {ROLE_LABELS[i.role]} · vence el {dateFormat.format(i.expiresAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button small danger"
                      aria-label={`Cancelar la invitación de ${i.email}`}
                      onClick={() =>
                        void run(() => request(`${base}/invitations/${i.id}`, null, { method: 'DELETE' }), 'Invitación cancelada.')
                      }
                    >
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function InviteForm({
  base,
  isOwner,
  onCreated,
}: {
  base: string;
  isOwner: boolean;
  onCreated: (invitation: CreatedInvitation) => Promise<void>;
}) {
  // El encargado no ve la opción "Encargado": la API igual se la rechazaría.
  const roles = isOwner ? (['kitchen', 'driver', 'manager'] as const) : (['kitchen', 'driver'] as const);
  // Controlado solo para mostrar debajo qué puede hacer el rol elegido.
  const [role, setRole] = useState<InvitableRole>('kitchen');

  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const parsed = invitationInputSchema.safeParse(formValues(form));
    if (!parsed.success) return issuesToFieldErrors(parsed);
    const invitation = await request(`${base}/invitations`, createdInvitationSchema, { method: 'POST', body: parsed.data });
    form.reset();
    setRole('kitchen');
    await onCreated(invitation);
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="stack">
      <FormError message={formError} />
      <Field name="email" label="Email de la persona" type="email" autoComplete="off" required error={fieldErrors.email} />
      <SelectField
        name="role"
        label="Rol"
        options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        value={role}
        onChange={(e) => setRole(e.target.value as InvitableRole)}
        hint={ROLE_DESCRIPTIONS[role]}
        error={fieldErrors.role}
      />
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? 'Creando invitación…' : 'Crear invitación'}
      </button>
    </form>
  );
}

// Muestra el link recién creado para copiarlo o mandarlo por WhatsApp.
function InvitationLink({
  invitation,
  businessName,
  onClose,
}: {
  invitation: CreatedInvitation;
  businessName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/invitacion/${invitation.token}`;
  const message = `Te invito a sumarte a ${businessName} en Comanda como ${ROLE_LABELS[invitation.role]}. Entrá acá: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sin permiso para el portapapeles: el link igual está a la vista para copiarlo a mano.
      setCopied(false);
    }
  }

  return (
    // role="status": el lector de pantalla anuncia que apareció el link.
    <div role="status" className="invite-link stack">
      <p>
        <strong>Listo.</strong> Mandale este link a {invitation.email}. Vence el {dateFormat.format(invitation.expiresAt)} y
        solo sirve para ese email.
      </p>
      <label htmlFor="invite-url" className="visually-hidden">
        Link de invitación
      </label>
      <input id="invite-url" className="link-box" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <div className="actions">
        <button type="button" className="button" onClick={copy}>
          {copied ? '¡Copiado!' : 'Copiar link'}
        </button>
        <a className="button primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          Mandar por WhatsApp
        </a>
        <button type="button" className="button" onClick={onClose}>
          Listo
        </button>
      </div>
    </div>
  );
}
