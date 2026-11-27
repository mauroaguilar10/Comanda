import pg from 'pg';

// Un pool reutiliza conexiones abiertas en vez de abrir una por consulta.
// En la etapa 1 esto pasa a usarse a través de Drizzle.
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

// Devuelve true si la base responde. Lo usa GET /health.
export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
