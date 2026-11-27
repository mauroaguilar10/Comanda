import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { businesses, memberships, type Role } from '../../db/schema.js';

// Un negocio visto desde una persona: los datos básicos y su rol ahí.
export interface UserBusiness {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

// Lo que el resto de la app necesita saber de las membresías:
// qué rol tiene una persona en un negocio (o null si no trabaja ahí)
// y en qué negocios trabaja.
export interface MembershipLookup {
  getRole(userId: string, businessId: string): Promise<Role | null>;
  listForUser(userId: string): Promise<UserBusiness[]>;
}

const uuid = z.uuid();

export function createMembershipLookup(db: Db): MembershipLookup {
  return {
    async getRole(userId, businessId) {
      // El businessId viene de la URL. Si no es un UUID, Postgres tira error
      // al compararlo con la columna (y la API respondería 500). No es miembro de nada.
      if (!uuid.safeParse(businessId).success) return null;

      const [row] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.businessId, businessId)))
        .limit(1);
      return row?.role ?? null;
    },

    async listForUser(userId) {
      // Join: por cada membresía de la persona, traemos los datos de su negocio.
      // Las dos tablas son de este módulo, así que no rompemos la regla de no leer tablas ajenas.
      return db
        .select({ id: businesses.id, name: businesses.name, slug: businesses.slug, role: memberships.role })
        .from(memberships)
        .innerJoin(businesses, eq(businesses.id, memberships.businessId))
        .where(eq(memberships.userId, userId))
        .orderBy(asc(businesses.name));
    },
  };
}
