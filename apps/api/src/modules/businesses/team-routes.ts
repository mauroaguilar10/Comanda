import {
  acceptInvitationResponseSchema,
  createdInvitationSchema,
  invitationInputSchema,
  invitationPreviewSchema,
  teamResponseSchema,
} from '@comanda/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../../plugins/auth.js';
import type { MembershipLookup } from './memberships.js';
import {
  AlreadyMemberError,
  CannotRemoveOwnerError,
  InvitationEmailMismatchError,
  InvitationNotFoundError,
  type TeamService,
} from './team.js';

export interface TeamRoutesOptions {
  team: TeamService;
  memberships: MembershipLookup;
}

const uuid = z.uuid();

// Rutas del equipo de un local. Se registran con prefix '/businesses/:businessId'.
export async function teamRoutes(app: FastifyInstance, opts: TeamRoutesOptions): Promise<void> {
  const { team, memberships } = opts;
  const managers = requireRole(memberships, 'manager');
  // Sin roles extra: solo pasa el dueño.
  const ownerOnly = requireRole(memberships);

  app.get('/team', { preHandler: managers }, async (request) => {
    const { businessId } = request.params as { businessId: string };
    return teamResponseSchema.parse(await team.getTeam(businessId));
  });

  app.post('/invitations', { preHandler: managers }, async (request, reply) => {
    const { businessId } = request.params as { businessId: string };
    const parsed = invitationInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));

    // Nadie da más permisos de los que tiene: el encargado invita a cocina y reparto,
    // y solo el dueño puede sumar otro encargado.
    if (parsed.data.role === 'manager' && request.membership?.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden', message: 'Solo el dueño puede invitar encargados.' });
    }

    try {
      const { invitation, token } = await team.invite(businessId, request.user!.id, parsed.data);
      return reply.code(201).send(createdInvitationSchema.parse({ ...invitation, token }));
    } catch (err) {
      if (err instanceof AlreadyMemberError) {
        return reply.code(409).send({
          error: 'already_member',
          message: 'Esa persona ya trabaja en el local.',
          fields: { email: ['Esa persona ya trabaja en el local.'] },
        });
      }
      throw err;
    }
  });

  app.delete('/invitations/:invitationId', { preHandler: managers }, async (request, reply) => {
    const { businessId, invitationId } = request.params as { businessId: string; invitationId: string };
    if (!uuid.safeParse(invitationId).success || !(await team.revokeInvitation(businessId, invitationId))) {
      return reply.code(404).send({ error: 'not_found', message: 'No existe esa invitación.' });
    }
    return reply.code(204).send();
  });

  app.delete('/members/:userId', { preHandler: ownerOnly }, async (request, reply) => {
    const { businessId, userId } = request.params as { businessId: string; userId: string };
    try {
      if (!uuid.safeParse(userId).success || !(await team.removeMember(businessId, userId))) {
        return reply.code(404).send({ error: 'not_found', message: 'Esa persona no trabaja en el local.' });
      }
    } catch (err) {
      if (err instanceof CannotRemoveOwnerError) {
        return reply.code(409).send({ error: 'cannot_remove_owner', message: 'No se puede sacar al dueño del local.' });
      }
      throw err;
    }
    return reply.code(204).send();
  });
}

// Rutas del link de invitación. Se registran con prefix '/invitations'.
export async function invitationRoutes(app: FastifyInstance, opts: { team: TeamService }): Promise<void> {
  const { team } = opts;
  const invalid = { error: 'invitation_invalid', message: 'Esta invitación no existe, ya se usó o venció.' };

  // Público: quien abre el link todavía puede no tener cuenta. Solo muestra el local,
  // el rol y para qué email es; sin el token (256 bits al azar) no se puede adivinar ninguna.
  app.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const preview = await team.previewInvitation(token);
    if (!preview) return reply.code(404).send(invalid);
    return invitationPreviewSchema.parse(preview);
  });

  app.post('/:token/accept', { preHandler: requireAuth }, async (request, reply) => {
    const { token } = request.params as { token: string };
    try {
      const result = await team.acceptInvitation(token, request.user!);
      return acceptInvitationResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof InvitationNotFoundError) return reply.code(404).send(invalid);
      if (err instanceof InvitationEmailMismatchError) {
        return reply.code(403).send({
          error: 'invitation_email_mismatch',
          message: `Esta invitación es para ${err.invitedEmail}. Entrá con esa cuenta para aceptarla.`,
        });
      }
      throw err;
    }
  });
}
