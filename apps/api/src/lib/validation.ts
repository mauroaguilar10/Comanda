import { z } from 'zod';

// Respuesta 400 cuando los datos no pasan el esquema Zod.
// `message` es el primer problema (para mostrar arriba del formulario)
// y `fields` los errores por campo (para mostrarlos debajo de cada input).
export function validationError(error: z.ZodError) {
  return {
    error: 'validation_error',
    message: error.issues[0]?.message ?? 'Datos inválidos',
    fields: z.flattenError(error).fieldErrors,
  };
}
