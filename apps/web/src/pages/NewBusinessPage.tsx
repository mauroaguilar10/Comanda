import { businessSchema, createBusinessInputSchema } from '@comanda/shared';
import { useState } from 'react';
import { ApiError, request } from '../api';
import { useAuth } from '../auth';
import { Field, FormError, formValues, issuesToFieldErrors, useFormSubmit } from '../forms';
import { Link, navigate } from '../router';

// "Pizzería Don Mario" -> "pizzeria-don-mario". Saca tildes (NFD separa la letra
// de su tilde y después borramos las tildes sueltas) y cambia todo lo demás por guiones.
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

export function NewBusinessPage() {
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Mientras no toquen el slug a mano, lo vamos armando a partir del nombre.
  const [slugEdited, setSlugEdited] = useState(false);

  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const values = formValues(form);
    // Teléfono y dirección son opcionales: si quedaron vacíos no los mandamos.
    const parsed = createBusinessInputSchema.safeParse({
      name: values.name,
      slug: values.slug,
      phone: values.phone || undefined,
      address: values.address || undefined,
    });
    if (!parsed.success) return issuesToFieldErrors(parsed);
    try {
      await request('/businesses', businessSchema, { method: 'POST', body: parsed.data });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slug_taken') return { slug: err.message };
      throw err;
    }
    // El negocio nuevo tiene que aparecer en la lista del inicio: volvemos a pedir /auth/me.
    await refresh();
    navigate('/');
  });

  return (
    <main className="container narrow">
      <p>
        <Link to="/">← Volver</Link>
      </p>
      <h1>Crear tu local</h1>
      <form onSubmit={handleSubmit} noValidate className="stack">
        <FormError message={formError} />
        <Field
          name="name"
          label="Nombre del local"
          autoComplete="organization"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          error={fieldErrors.name}
        />
        <Field
          name="slug"
          label="Dirección de tu tienda"
          required
          autoCapitalize="none"
          spellCheck={false}
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
          hint={`Tus clientes van a pedir en pedir.mauroaglr.com/${slug || 'tu-local'}`}
          error={fieldErrors.slug}
        />
        <Field name="phone" label="Teléfono (opcional)" type="tel" autoComplete="tel" error={fieldErrors.phone} />
        <Field
          name="address"
          label="Dirección (opcional)"
          autoComplete="street-address"
          error={fieldErrors.address}
        />
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? 'Creando…' : 'Crear local'}
        </button>
      </form>
    </main>
  );
}
