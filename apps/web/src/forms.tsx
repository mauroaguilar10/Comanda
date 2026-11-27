import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { ApiError } from './api';

export type FieldErrors = Record<string, string | undefined>;

// Un campo de formulario accesible: el <label> está unido al input por id,
// y el error y la ayuda se anuncian con aria-describedby (el lector de pantalla
// los lee al entrar al campo). aria-invalid marca el campo con error.
export function Field({
  name,
  id: idProp,
  label,
  error,
  hint,
  ...input
}: { name: string; label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  // Pasá un id propio si puede haber dos formularios con el mismo campo en pantalla:
  // los ids tienen que ser únicos para que cada <label> apunte a su input.
  const id = idProp ?? `field-${name}`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

// Lo que devuelve schema.safeParse cuando falla, reducido a lo que usamos.
interface ParseFailure {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}

// Pasa los errores de Zod a { campo: mensaje }, quedándose con el primero de cada campo.
export function issuesToFieldErrors(failure: ParseFailure): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of failure.error.issues) {
    const key = String(issue.path[0] ?? '');
    errors[key] ??= issue.message;
  }
  return errors;
}

// Lee los valores del formulario como texto. Los inputs no están "controlados" por React:
// el navegador guarda lo que se escribe y lo leemos recién al enviar.
export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string') values[key] = value;
  });
  return values;
}

// Maneja lo que se repite en todos los formularios: el estado "enviando", los errores
// por campo y el error general. `onSubmit` hace el trabajo; si tira un ApiError,
// sus errores se muestran en el formulario.
export function useFormSubmit(onSubmit: (form: HTMLFormElement) => Promise<FieldErrors | void>) {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setFormError(null);
    let errors: FieldErrors = {};
    try {
      errors = (await onSubmit(form)) ?? {};
    } catch (err) {
      if (err instanceof ApiError) {
        errors = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, v?.[0]]));
        if (Object.keys(errors).length === 0) setFormError(err.message);
      } else {
        // Un error que no esperábamos (un bug, o la API respondió con otra forma de datos).
        // Antes se perdía y el formulario no mostraba nada: ahora avisamos y lo dejamos en la consola.
        console.error(err);
        setFormError('Algo salió mal. Probá de nuevo en un rato.');
      }
    } finally {
      setPending(false);
    }
    setFieldErrors(errors);

    // Llevamos el foco al primer campo con error, así quien usa teclado
    // o lector de pantalla no tiene que salir a buscarlo.
    const first = Object.keys(errors).find((k) => errors[k]);
    if (first) requestAnimationFrame(() => form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  }

  return { pending, fieldErrors, formError, handleSubmit };
}

// Mensaje de error general del formulario. role="alert" hace que el lector de pantalla
// lo lea apenas aparece.
export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="form-error">
      {message}
    </p>
  ) : null;
}
