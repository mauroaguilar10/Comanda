import type { CreateBusinessInput } from '@comanda/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { businesses, memberships, type Business } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';

// "Ese slug ya lo usa otro local". La ruta lo traduce a un 409.
export class SlugTakenError extends Error {
  constructor() {
    super('El slug ya está en uso');
    this.name = 'SlugTakenError';
  }
}

export interface BusinessService {
  // Crea el negocio y deja a ownerId como dueño. Tira SlugTakenError si el slug está tomado.
  createWithOwner(ownerId: string, input: CreateBusinessInput): Promise<Business>;
  findById(id: string): Promise<Business | null>;
  // Para la tienda pública: pedir.mauroaglr.com/<slug>.
  findBySlug(slug: string): Promise<Business | null>;
}

export function createBusinessService(db: Db): BusinessService {
  return {
    async createWithOwner(ownerId, input) {
      try {
        // Todo o nada: si falla la membresía, Postgres deshace también el insert del negocio
        // (rollback) y no queda un local sin dueño. Ojo: adentro se usa `tx`, no `db`;
        // lo que se haga con `db` iría por otra conexión, fuera de la transacción.
        return await db.transaction(async (tx) => {
          const [business] = await tx
            .insert(businesses)
            .values({ name: input.name, slug: input.slug, phone: input.phone, address: input.address })
            .returning();
          await tx.insert(memberships).values({ businessId: business!.id, userId: ownerId, role: 'owner' });
          return business!;
        });
      } catch (err) {
        // No chequeamos el slug antes con un SELECT: entre el SELECT y el INSERT otro
        // podría tomarlo. Dejamos que el índice único decida y traducimos el error.
        if (isUniqueViolation(err)) throw new SlugTakenError();
        throw err;
      }
    },

    async findById(id) {
      const [row] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
      return row ?? null;
    },

    async findBySlug(slug) {
      const [row] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
      return row ?? null;
    },
  };
}
