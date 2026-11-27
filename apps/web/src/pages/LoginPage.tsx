import { loginInputSchema } from '@comanda/shared';
import { useAuth } from '../auth';
import { Field, FormError, formValues, issuesToFieldErrors, useFormSubmit } from '../forms';
import { getSearchParam, Link } from '../router';

export function LoginPage() {
  const { login } = useAuth();
  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    // Validamos con el mismo esquema que la API antes de mandar: error al instante, sin ir al servidor.
    const parsed = loginInputSchema.safeParse(formValues(form));
    if (!parsed.success) return issuesToFieldErrors(parsed);
    // Si sale bien, AuthProvider pasa a "authenticated" y App muestra el inicio.
    // Un 401 llega como ApiError sin campos: useFormSubmit lo muestra como error general.
    await login(parsed.data);
  });

  return (
    <main className="container narrow">
      <h1>Entrar a Comanda</h1>
      {/* noValidate: validamos nosotros, con los mismos mensajes que la API. */}
      <form onSubmit={handleSubmit} noValidate className="stack">
        <FormError message={formError} />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          // Viene precargado desde el link de invitación (?email=...).
          defaultValue={getSearchParam('email') ?? ''}
          error={fieldErrors.email}
        />
        <Field
          name="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          error={fieldErrors.password}
        />
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p>
        ¿No tenés cuenta? <Link to={`/registro${window.location.search}`}>Creá una</Link>
      </p>
    </main>
  );
}
