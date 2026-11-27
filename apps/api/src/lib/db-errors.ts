// Código de Postgres para "violación de índice único" (por ejemplo, un email repetido).
// Lista completa: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';

// Drizzle envuelve el error de pg en su propio error y deja el original en `cause`,
// así que miramos los dos lugares.
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? e.code : undefined);
  return code(err) === UNIQUE_VIOLATION || code((err as { cause?: unknown } | null)?.cause) === UNIQUE_VIOLATION;
}
