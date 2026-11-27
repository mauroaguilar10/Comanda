import { apiErrorSchema } from '@comanda/shared';

// En desarrollo la web llama a /api y Vite lo pasa a la API (ver vite.config.ts).
// En producción se configura VITE_API_URL con la dirección de la API.
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

// Cualquier esquema de Zod cumple esto. Lo pedimos así para no depender de zod en la web.
interface Schema<T> {
  parse(data: unknown): T;
}

// Error de la API con lo que hace falta para mostrarlo en pantalla.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string[] | undefined> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Hace la llamada, convierte las respuestas de error en ApiError y valida
// la respuesta buena con el mismo esquema que usa la API. Si la API cambia
// la forma de los datos, nos enteramos acá y no con un "undefined" en pantalla.
export async function request<T>(
  path: string,
  schema: Schema<T> | null,
  // body: un objeto se manda como JSON; un Blob (por ejemplo, una foto) se manda tal cual.
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { body } = init;
  const isFile = body instanceof Blob;
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method: init.method ?? 'GET',
      // Manda y recibe la cookie de sesión (hace falta cuando la API está en otro dominio).
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': isFile ? body.type : 'application/json' },
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor. Revisá tu conexión.');
  }

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.error, parsed.data.message, parsed.data.fields);
    }
    throw new ApiError(res.status, 'unknown_error', 'Algo salió mal. Probá de nuevo en un rato.');
  }

  // 204 No Content (por ejemplo, logout): no hay cuerpo para leer.
  if (res.status === 204 || schema === null) return undefined as T;
  return schema.parse(await res.json());
}
