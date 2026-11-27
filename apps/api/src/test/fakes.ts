import { randomUUID } from 'node:crypto';
import type { Business, Role, User } from '../db/schema.js';
import type { AuthUser, SessionService } from '../modules/auth/sessions.js';
import { EmailTakenError, type UserRepository } from '../modules/auth/users.js';
import type { MembershipLookup } from '../modules/businesses/memberships.js';

// Versiones en memoria de los servicios, para los tests.
// Cumplen la misma interfaz que las de Drizzle, así la app no nota la diferencia.

// `users` es la lista donde busca al resolver un token. Se lee en cada resolve,
// así que si le pasás fakeUsers().all ve también a los que se registren durante el test.
export function fakeSessions(users: AuthUser[] = []): SessionService & { tokens: Map<string, string> } {
  const tokens = new Map<string, string>(); // token -> userId
  let counter = 0;
  return {
    tokens,
    async create(userId) {
      const token = `token-${++counter}`;
      tokens.set(token, userId);
      return { token, expiresAt: new Date(Date.now() + 60_000) };
    },
    async resolve(token) {
      const userId = tokens.get(token);
      const user = users.find((u) => u.id === userId);
      // Como la versión real: solo estos tres campos, nunca el hash.
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    },
    async revoke(token) {
      tokens.delete(token);
    },
  };
}

export interface FakeMembership {
  userId: string;
  businessId: string;
  role: Role;
}

// `businesses` hace de tabla businesses para el join de listForUser.
export function fakeMemberships(
  entries: FakeMembership[] = [],
  businesses: Business[] = [],
): MembershipLookup & { entries: FakeMembership[]; businesses: Business[] } {
  return {
    entries,
    businesses,
    async getRole(userId, businessId) {
      return entries.find((e) => e.userId === userId && e.businessId === businessId)?.role ?? null;
    },
    async listForUser(userId) {
      return entries
        .filter((e) => e.userId === userId)
        .flatMap((e) => {
          const b = businesses.find((x) => x.id === e.businessId);
          return b ? [{ id: b.id, name: b.name, slug: b.slug, role: e.role }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

export function fakeUsers(initial: User[] = []): UserRepository & { all: User[] } {
  const all = [...initial];
  return {
    all,
    async findByEmail(email) {
      return all.find((u) => u.email === email) ?? null;
    },
    async create(data) {
      // Igual que el índice único de la base.
      if (all.some((u) => u.email === data.email)) throw new EmailTakenError();
      const now = new Date();
      const user: User = { id: randomUUID(), emailVerifiedAt: null, createdAt: now, updatedAt: now, ...data };
      all.push(user);
      return user;
    },
  };
}

// Un negocio completo con valores por defecto, para cargar datos en los tests.
export function makeBusiness(data: Partial<Business> & { name: string; slug: string }): Business {
  const now = new Date();
  return {
    id: randomUUID(),
    businessType: 'food',
    phone: null,
    address: null,
    timezone: 'America/Argentina/San_Luis',
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}
