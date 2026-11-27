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
import { Field, FormError, formValues, issuesToFieldErrors, useFormSubmit } from '../forms';
import { centsToInput, formatPrice, parsePrice } from '../money';
import { Link, Redirect } from '../router';

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
  const canEdit = business.role === 'owner' || business.role === 'manager';

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
      <p>
        <Link to="/">← Tus locales</Link>
      </p>
      <h1>{business.name}</h1>
      <p className="muted">Menú{canEdit ? '' : ' (solo lectura)'}</p>

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
      <div className="product-info">
        <h3>{product.name}</h3>
        {product.description && <p className="muted">{product.description}</p>}
        <p>
          <strong>{formatPrice(product.priceCents)}</strong>
          {!product.available && <span className="badge paused-badge">Pausado</span>}
        </p>
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
  onDone,
}: {
  base: string;
  product?: ProductResponse;
  categoryId: string;
  categories: Category[];
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
