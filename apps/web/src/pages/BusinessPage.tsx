import {
  catalogResponseSchema,
  categoryInputSchema,
  categorySchema,
  productInputSchema,
  productSchema,
  productUpdateSchema,
  type CatalogResponse,
  type MeResponse,
  type ProductResponse,
} from '@comanda/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, request } from '../api';
import { resizeImage } from '../image';
import { Field, FormError, formValues, issuesToFieldErrors, useFormSubmit } from '../forms';
import { centsToInput, formatPrice, parsePrice } from '../money';
import { canManage } from '../roles';
import { Redirect } from '../router';
import { BusinessNav } from './BusinessNav';

type Category = CatalogResponse['categories'][number];

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; catalog: CatalogResponse };

const PRICE_HINT = 'En pesos, por ejemplo 4500 o 4.500,50';

// Pantalla del menú de un local. Dueño y encargado lo editan; cocina y reparto solo lo ven.
// La API vuelve a chequear el rol en cada cambio: esconder los botones es comodidad, no seguridad.
export function BusinessPage({ businessId, me }: { businessId: string; me: MeResponse }) {
  const business = me.businesses.find((b) => b.id === businessId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Mensaje del último cambio ("Categoría borrada", o un error). Se anuncia con aria-live.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const base = `/businesses/${businessId}`;

  // Después de cada cambio volvemos a pedir el menú entero. Es simple y
  // siempre muestra lo que de verdad quedó guardado.
  const reload = useCallback(async () => {
    try {
      setState({ status: 'ready', catalog: await request(`${base}/catalog`, catalogResponseSchema) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'No pudimos cargar el menú.' });
    }
  }, [base]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!business) return <Redirect to="/" />;
  const canEdit = canManage(business.role);

  // Envuelve una acción de los botones (borrar, pausar): muestra el resultado y recarga.
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
      <BusinessNav business={business} current="menu" />
      {!canEdit && <p className="muted">Menú (solo lectura)</p>}

      {/* aria-live: el lector de pantalla anuncia el mensaje cuando cambia, sin mover el foco. */}
      <div aria-live="polite">
        {notice && <p className={notice.kind === 'ok' ? 'notice' : 'form-error'}>{notice.text}</p>}
      </div>

      {canEdit && <NewCategoryForm base={base} onCreated={reload} />}

      {state.status === 'loading' && <p className="muted">Cargando el menú…</p>}
      {state.status === 'error' && <p role="alert" className="form-error">{state.message}</p>}
      {state.status === 'ready' && state.catalog.categories.length === 0 && (
        <p className="muted">
          {canEdit
            ? 'Todavía no hay nada. Empezá creando una categoría, por ejemplo "Pizzas" o "Empanadas".'
            : 'Todavía no hay productos cargados.'}
        </p>
      )}
      {state.status === 'ready' &&
        state.catalog.categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            categories={state.catalog.categories}
            base={base}
            canEdit={canEdit}
            run={run}
            reload={reload}
          />
        ))}
    </main>
  );
}

function NewCategoryForm({ base, onCreated }: { base: string; onCreated: () => Promise<void> }) {
  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const parsed = categoryInputSchema.safeParse(formValues(form));
    if (!parsed.success) return issuesToFieldErrors(parsed);
    await request(`${base}/categories`, categorySchema, { method: 'POST', body: parsed.data });
    form.reset();
    await onCreated();
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="inline-form">
      <FormError message={formError} />
      <Field name="name" id="new-category-name" label="Nueva categoría" placeholder="Ej.: Pizzas" error={fieldErrors.name} />
      <button type="submit" className="button" disabled={pending}>
        {pending ? 'Agregando…' : 'Agregar categoría'}
      </button>
    </form>
  );
}

function CategorySection({
  category,
  categories,
  base,
  canEdit,
  run,
  reload,
}: {
  category: Category;
  categories: Category[];
  base: string;
  canEdit: boolean;
  run: (action: () => Promise<unknown>, okText: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const headingId = `category-${category.id}`;

  return (
    // aria-labelledby: la sección se anuncia con el nombre de la categoría.
    <section className="category" aria-labelledby={headingId}>
      {renaming ? (
        <RenameCategoryForm
          base={base}
          category={category}
          onDone={async (changed) => {
            setRenaming(false);
            if (changed) await reload();
          }}
        />
      ) : (
        <div className="category-header">
          <h2 id={headingId}>{category.name}</h2>
          {canEdit && (
            <div className="actions">
              <button type="button" className="button small" onClick={() => setRenaming(true)} aria-label={`Renombrar ${category.name}`}>
                Renombrar
              </button>
              <button
                type="button"
                className="button small danger"
                aria-label={`Borrar ${category.name}`}
                onClick={() => {
                  if (window.confirm(`¿Borrar la categoría "${category.name}"?`)) {
                    void run(() => request(`${base}/categories/${category.id}`, null, { method: 'DELETE' }), 'Categoría borrada.');
                  }
                }}
              >
                Borrar
              </button>
            </div>
          )}
        </div>
      )}

      {category.products.length === 0 && !adding && <p className="muted">Sin productos todavía.</p>}

      <ul className="products" role="list">
        {category.products.map((product) => (
          <ProductRow key={product.id} product={product} categories={categories} base={base} canEdit={canEdit} run={run} reload={reload} />
        ))}
      </ul>

      {canEdit &&
        (adding ? (
          <ProductForm
            base={base}
            categoryId={category.id}
            categories={categories}
            onDone={async (changed) => {
              setAdding(false);
              if (changed) await reload();
            }}
          />
        ) : (
          <button type="button" className="button" onClick={() => setAdding(true)} aria-label={`Agregar producto a ${category.name}`}>
            + Agregar producto
          </button>
        ))}
    </section>
  );
}

function RenameCategoryForm({
  base,
  category,
  onDone,
}: {
  base: string;
  category: Category;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const parsed = categoryInputSchema.safeParse(formValues(form));
    if (!parsed.success) return issuesToFieldErrors(parsed);
    await request(`${base}/categories/${category.id}`, categorySchema, { method: 'PATCH', body: parsed.data });
    await onDone(true);
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="inline-form">
      <FormError message={formError} />
      <Field
        name="name"
        id={`rename-${category.id}`}
        label="Nombre de la categoría"
        defaultValue={category.name}
        autoFocus
        error={fieldErrors.name}
      />
      <div className="actions">
        <button type="submit" className="button primary small" disabled={pending}>
          Guardar
        </button>
        <button type="button" className="button small" onClick={() => void onDone(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ProductRow({
  product,
  categories,
  base,
  canEdit,
  run,
  reload,
}: {
  product: ProductResponse;
  categories: Category[];
  base: string;
  canEdit: boolean;
  run: (action: () => Promise<unknown>, okText: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const url = `${base}/products/${product.id}`;

  if (editing) {
    return (
      <li className="product">
        <ProductForm
          base={base}
          product={product}
          categoryId={product.categoryId}
          categories={categories}
          reload={reload}
          onDone={async (changed) => {
            setEditing(false);
            if (changed) await reload();
          }}
        />
      </li>
    );
  }

  return (
    <li className={product.available ? 'product' : 'product paused'}>
      <div className="product-main">
        {product.imageUrl && (
          // alt vacío: el nombre está justo al lado; repetirlo no le suma nada al lector de pantalla.
          // width/height reservan el lugar y evitan que la página "salte" al cargar la foto.
          <img className="product-thumb" src={product.imageUrl} alt="" width={72} height={72} loading="lazy" />
        )}
        <div className="product-info">
          <h3>{product.name}</h3>
          {product.description && <p className="muted">{product.description}</p>}
          <p>
            <strong>{formatPrice(product.priceCents)}</strong>
            {!product.available && <span className="badge paused-badge">Pausado</span>}
          </p>
        </div>
      </div>
      {canEdit && (
        <div className="actions">
          <button
            type="button"
            className="button small"
            aria-label={`${product.available ? 'Pausar' : 'Activar'} ${product.name}`}
            onClick={() =>
              void run(
                () => request(url, productSchema, { method: 'PATCH', body: { available: !product.available } }),
                product.available ? `"${product.name}" quedó pausado.` : `"${product.name}" está disponible de nuevo.`,
              )
            }
          >
            {product.available ? 'Pausar' : 'Activar'}
          </button>
          <button type="button" className="button small" onClick={() => setEditing(true)} aria-label={`Editar ${product.name}`}>
            Editar
          </button>
          <button
            type="button"
            className="button small danger"
            aria-label={`Borrar ${product.name}`}
            onClick={() => {
              if (window.confirm(`¿Borrar "${product.name}"?`)) {
                void run(() => request(url, null, { method: 'DELETE' }), 'Producto borrado.');
              }
            }}
          >
            Borrar
          </button>
        </div>
      )}
    </li>
  );
}

// Sirve para crear (sin `product`) y para editar (con `product`).
function ProductForm({
  base,
  product,
  categoryId,
  categories,
  reload,
  onDone,
}: {
  base: string;
  product?: ProductResponse;
  categoryId: string;
  categories: Category[];
  // Para refrescar después de cambiar la foto sin cerrar el formulario.
  reload?: () => Promise<void>;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const { pending, fieldErrors, formError, handleSubmit } = useFormSubmit(async (form) => {
    const values = formValues(form);
    const priceCents = parsePrice(values.priceCents ?? '');
    if (priceCents === null) return { priceCents: 'Poné un precio válido, por ejemplo 4500 o 4.500,50' };

    const body = {
      categoryId: values.categoryId,
      name: values.name,
      description: values.description || (product ? null : undefined),
      priceCents,
    };
    if (product) {
      const parsed = productUpdateSchema.safeParse(body);
      if (!parsed.success) return issuesToFieldErrors(parsed);
      await request(`${base}/products/${product.id}`, productSchema, { method: 'PATCH', body: parsed.data });
    } else {
      const parsed = productInputSchema.safeParse(body);
      if (!parsed.success) return issuesToFieldErrors(parsed);
      await request(`${base}/products`, productSchema, { method: 'POST', body: parsed.data });
    }
    await onDone(true);
  });

  const prefix = product ? `edit-${product.id}` : `new-${categoryId}`;

  return (
    <form onSubmit={handleSubmit} noValidate className="product-form stack">
      <FormError message={formError} />
      {/* Los ids llevan un prefijo: puede haber varios formularios abiertos a la vez. */}
      <Field
        name="name"
        id={`${prefix}-name`}
        label="Nombre"
        defaultValue={product?.name}
        autoFocus
        required
        error={fieldErrors.name}
      />
      <Field
        name="description"
        id={`${prefix}-description`}
        label="Descripción (opcional)"
        defaultValue={product?.description ?? ''}
        error={fieldErrors.description}
      />
      <Field
        name="priceCents"
        id={`${prefix}-price`}
        label="Precio"
        // inputMode decimal: en el celular aparece el teclado numérico con coma.
        inputMode="decimal"
        defaultValue={product ? centsToInput(product.priceCents) : ''}
        hint={PRICE_HINT}
        required
        error={fieldErrors.priceCents}
      />
      {product ? (
        <ProductPhoto base={base} product={product} onChanged={reload ?? (async () => {})} />
      ) : (
        <p className="hint">La foto se agrega después, desde "Editar".</p>
      )}
      {product ? (
        <div className="field">
          <label htmlFor={`${prefix}-category`}>Categoría</label>
          <select id={`${prefix}-category`} name="categoryId" defaultValue={categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {fieldErrors.categoryId && <p className="field-error">{fieldErrors.categoryId}</p>}
        </div>
      ) : (
        <input type="hidden" name="categoryId" value={categoryId} />
      )}
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? 'Guardando…' : product ? 'Guardar cambios' : 'Agregar producto'}
        </button>
        <button type="button" className="button" onClick={() => void onDone(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Foto del producto. Se sube apenas se elige (no espera a "Guardar cambios"):
// es un archivo aparte del resto de los datos.
function ProductPhoto({
  base,
  product,
  onChanged,
}: {
  base: string;
  product: ProductResponse;
  onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `${base}/products/${product.id}/image`;
  const inputId = `photo-${product.id}`;

  async function change(action: 'upload' | 'remove', work: () => Promise<unknown>) {
    setPending(action);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar la foto.');
    } finally {
      setPending(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    await change('upload', async () => {
      const resized = await resizeImage(file);
      await request(url, productSchema, { method: 'PUT', body: resized });
    });
  }

  return (
    // fieldset + legend: agrupa los controles de la foto bajo un mismo nombre.
    <fieldset className="photo-field">
      <legend>Foto</legend>
      {product.imageUrl ? (
        <img className="photo-preview" src={product.imageUrl} alt={`Foto actual de ${product.name}`} width={160} height={160} />
      ) : (
        <p className="muted">Sin foto todavía.</p>
      )}
      <div className="actions">
        {/* El input real queda oculto pero enfocable; el label hace de botón y lo abre.
            accept="image/*": en el celular ofrece la cámara o la galería. */}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="visually-hidden file-input"
          disabled={pending !== null}
          onChange={(e) => {
            void onFile(e.currentTarget.files?.[0]);
            // Limpiamos el valor para que elegir la misma foto otra vez vuelva a disparar onChange.
            e.currentTarget.value = '';
          }}
        />
        <label htmlFor={inputId} className="button small" aria-disabled={pending !== null}>
          {pending === 'upload' ? 'Subiendo…' : product.imageUrl ? 'Cambiar foto' : 'Agregar foto'}
        </label>
        {product.imageUrl && (
          <button
            type="button"
            className="button small danger"
            disabled={pending !== null}
            onClick={() => void change('remove', () => request(url, productSchema, { method: 'DELETE' }))}
          >
            {pending === 'remove' ? 'Quitando…' : 'Quitar foto'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
