import { businessSchema, createBusinessInputSchema } from '@comanda/shared';
import type { FastifyInstance } from 'fastify';
import { validationError } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../../plugins/auth.js';
import { SlugTakenError, type BusinessService } from './businesses.js';
import type { MembershipLookup } from './memberships.js';

export interface BusinessRoutesOptions {
  businesses: BusinessService;
  memberships: MembershipLookup;
}

export async function businessRoutes(app: FastifyInstance, opts: BusinessRoutesOptions): Promise<void> {
  const { businesses, memberships } = opts;

  // Cualquier persona logueada puede abrir su local; queda como dueña.
  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createBusinessInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));

    try {
      const business = await businesses.createWithOwner(request.user!.id, parsed.data);
      // businessSchema.parse deja solo los campos públicos (saca createdAt, etc.).
      return reply.code(201).send(businessSchema.parse(business));
    } catch (err) {
      if (err instanceof SlugTakenError) {
        return reply.code(409).send({ error: 'slug_taken', message: 'Ese nombre de tienda ya está en uso.' });
      }
      throw err;
    }
  });

  // Cualquier miembro (el dueño pasa siempre). Quien no trabaja ahí recibe 403.
  app.get(
    '/:businessId',
    { preHandler: requireRole(memberships, 'manager', 'kitchen', 'driver') },
    async (request, reply) => {
      const { businessId } = request.params as { businessId: string };
      const business = await businesses.findById(businessId);
      // Con una membresía válida el negocio existe (la FK lo garantiza), pero por las dudas.
      if (!business) return reply.code(404).send({ error: 'not_found', message: 'No existe ese negocio.' });
      return businessSchema.parse(business);
    },
  );
}
