import { registerInputSchema } from '@comanda/shared';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { Field, FormError, formValues, issuesToFieldErrors, useFormSubmit } from '../forms';
import { Link } from '../router';

export function RegisterPage() {
  const { register } = useAuth();
  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const parsed = registerInputSchema.safeParse(formValues(form));
    if (!parsed.success) return issuesToFieldErrors(parsed);
    try {
      await register(parsed.data);
    } catch (err) {
      // El 409 no trae errores por campo, pero sabemos que el problema es el email:
      // lo mostramos debajo de ese campo.
      if (err instanceof ApiError && err.code === 'email_taken') return { email: err.message };
      throw err;
    }
  });

  return (
    <main className="container narrow">
      <h1>Crear tu cuenta</h1>
      <p className="lead">Después vas a poder cargar tu local y empezar a recibir pedidos.</p>
      <form onSubmit={handleSubmit} noValidate className="stack">
        <FormError message={formError} />
        <Field name="name" label="Tu nombre" autoComplete="name" required error={fieldErrors.name} />
        <Field name="email" label="Email" type="email" autoComplete="email" required error={fieldErrors.email} />
        <Field
          name="password"
          label="Contraseña"
          type="password"
          // new-password: el gestor de contraseñas ofrece generar una segura.
          autoComplete="new-password"
          required
          minLength={10}
          hint="Mínimo 10 caracteres."
          error={fieldErrors.password}
        />
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p>
        ¿Ya tenés cuenta? <Link to="/login">Entrá</Link>
      </p>
    </main>
  );
}
