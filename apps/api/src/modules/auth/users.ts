import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { users, type User } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';

// Error propio para "ese email ya tiene cuenta". La ruta lo traduce a un 409.
// Así la ruta no necesita saber nada de códigos de error de Postgres.
export class EmailTakenError extends Error {
  constructor() {
    super('El email ya está registrado');
    this.name = 'EmailTakenError';
  }
}

// Mismo patrón que SessionService: la interfaz dice qué se puede hacer,
// createUserRepository lo hace con Drizzle y fakeUsers (en los tests) en memoria.
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  // Tira EmailTakenError si el email ya existe.
  create(data: { email: string; name: string; passwordHash: string }): Promise<User>;
}

export function createUserRepository(db: Db): UserRepository {
  return {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },

    async create(data) {
      try {
        const [row] = await db.insert(users).values(data).returning();
        return row!;
      } catch (err) {
        // Aunque la ruta chequea antes con findByEmail, dos registros simultáneos
        // con el mismo email pueden pasar ese chequeo. El índice único de la base
        // es la garantía real; acá convertimos ese error en uno nuestro.
        if (isUniqueViolation(err)) throw new EmailTakenError();
        throw err;
      }
    },
  };
}
