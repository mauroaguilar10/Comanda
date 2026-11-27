import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';
import { generateToken, hashToken } from '../../lib/tokens.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

// Lo que el resto de la app sabe del usuario logueado.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// El contrato: qué se puede hacer con sesiones, sin decir cómo.
// La app depende de esta interfaz; en producción usa la versión con Drizzle
// y en los tests una falsa en memoria.
export interface SessionService {
  create(userId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }>;
  resolve(token: string): Promise<AuthUser | null>;
  revoke(token: string): Promise<void>;
}

export function createSessionService(db: Db): SessionService {
  return {
    async create(userId, userAgent) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, userAgent });
      return { token, expiresAt };
    },

    async resolve(token) {
      const [row] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
        .limit(1);
      return row ?? null;
    },

    async revoke(token) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },
  };
}
