import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

// Drizzle usa el mismo pool de conexiones que ya teníamos en db.ts.
export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
