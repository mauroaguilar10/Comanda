// Código de Postgres para "violación de índice único" (por ejemplo, un email repetido).
// Lista completa: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
// "Otra fila todavía apunta a esta" (por ejemplo, borrar una categoría con productos).
const FOREIGN_KEY_VIOLATION = '23503';

// Drizzle envuelve el error de pg en su propio error y deja el original en `cause`,
// así que miramos los dos lugares.
function hasPgCode(err: unknown, expected: string): boolean {
  const code = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? e.code : undefined);
  return code(err) === expected || code((err as { cause?: unknown } | null)?.cause) === expected;
}

export function isUniqueViolation(err: unknown): boolean {
  return hasPgCode(err, UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(err: unknown): boolean {
  return hasPgCode(err, FOREIGN_KEY_VIOLATION);
}
