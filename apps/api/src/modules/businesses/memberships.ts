import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { memberships, type Role } from '../../db/schema.js';

// Lo único que la guardia de roles necesita saber: qué rol tiene
// una persona en un negocio (o null si no trabaja ahí).
export interface MembershipLookup {
  getRole(userId: string, businessId: string): Promise<Role | null>;
}

export function createMembershipLookup(db: Db): MembershipLookup {
  return {
    async getRole(userId, businessId) {
      const [row] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.businessId, businessId)))
        .limit(1);
      return row?.role ?? null;
    },
  };
}
