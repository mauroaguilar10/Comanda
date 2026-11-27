import type { Role } from '../db/schema.js';
import type { AuthUser, SessionService } from '../modules/auth/sessions.js';
import type { MembershipLookup } from '../modules/businesses/memberships.js';

// Versiones en memoria de los servicios, para los tests.
// Cumplen la misma interfaz que las de Drizzle, así la app no nota la diferencia.

export function fakeSessions(users: AuthUser[] = []): SessionService & { tokens: Map<string, string> } {
  const tokens = new Map<string, string>(); // token -> userId
  return {
    tokens,
    async create(userId) {
      const token = `token-${tokens.size + 1}`;
      tokens.set(token, userId);
      return { token, expiresAt: new Date(Date.now() + 60_000) };
    },
    async resolve(token) {
      const userId = tokens.get(token);
      return users.find((u) => u.id === userId) ?? null;
    },
    async revoke(token) {
      tokens.delete(token);
    },
  };
}

export function fakeMemberships(entries: { userId: string; businessId: string; role: Role }[] = []): MembershipLookup {
  return {
    async getRole(userId, businessId) {
      return entries.find((e) => e.userId === userId && e.businessId === businessId)?.role ?? null;
    },
  };
}
