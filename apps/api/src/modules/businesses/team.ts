import type { InvitationInput } from '@comanda/shared';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { businesses, invitations, memberships, type Invitation, type Role } from '../../db/schema.js';
import { generateToken, hashToken } from '../../lib/tokens.js';
import type { UserRepository } from '../auth/users.js';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// El link no existe, ya se usó o venció. Un solo error para los tres casos:
// a quien prueba tokens no le decimos cuáles existieron.
export class InvitationNotFoundError extends Error {
  constructor() {
    super('La invitación no existe o ya no es válida');
    this.name = 'InvitationNotFoundError';
  }
}

// Quien abre el link está logueado con otro email.
export class InvitationEmailMismatchError extends Error {
  constructor(readonly invitedEmail: string) {
    super('La invitación es para otro email');
    this.name = 'InvitationEmailMismatchError';
  }
}

export class AlreadyMemberError extends Error {
  constructor() {
    super('Esa persona ya trabaja en el local');
    this.name = 'AlreadyMemberError';
  }
}

export class CannotRemoveOwnerError extends Error {
  constructor() {
    super('No se puede sacar al dueño');
    this.name = 'CannotRemoveOwnerError';
  }
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface TeamService {
  // Miembros y las invitaciones pendientes (sin aceptar y sin vencer).
  getTeam(businessId: string): Promise<{ members: TeamMember[]; invitations: Invitation[] }>;
  // Devuelve el token en claro: es la única vez que existe fuera del link.
  invite(businessId: string, invitedBy: string, input: InvitationInput): Promise<{ invitation: Invitation; token: string }>;
  revokeInvitation(businessId: string, invitationId: string): Promise<boolean>;
  // null si el token no sirve (no existe, ya se usó o venció).
  previewInvitation(token: string): Promise<{ businessName: string; role: Role; email: string } | null>;
  acceptInvitation(token: string, user: { id: string; email: string }): Promise<{ businessId: string }>;
  // false si no es miembro. Tira CannotRemoveOwnerError si es el dueño.
  removeMember(businessId: string, userId: string): Promise<boolean>;
}

// `users` es el servicio del módulo auth: la tabla users no es nuestra, así que no la leemos directo.
export function createTeamService(db: Db, users: UserRepository): TeamService {
  // Condición de "invitación todavía usable".
  const pending = () => and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()));

  return {
    async getTeam(businessId) {
      const [rows, pendingInvitations] = await Promise.all([
        db
          .select({ userId: memberships.userId, role: memberships.role })
          .from(memberships)
          .where(eq(memberships.businessId, businessId))
          .orderBy(asc(memberships.createdAt)),
        db
          .select()
          .from(invitations)
          .where(and(eq(invitations.businessId, businessId), pending()))
          .orderBy(asc(invitations.createdAt)),
      ]);
      const people = await users.findByIds(rows.map((r) => r.userId));
      const members = rows.flatMap((r) => {
        const user = people.find((u) => u.id === r.userId);
        return user ? [{ userId: r.userId, name: user.name, email: user.email, role: r.role }] : [];
      });
      return { members, invitations: pendingInvitations };
    },

    async invite(businessId, invitedBy, input) {
      const existing = await users.findByEmail(input.email);
      if (existing) {
        const [member] = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.businessId, businessId), eq(memberships.userId, existing.id)))
          .limit(1);
        if (member) throw new AlreadyMemberError();
      }

      const token = generateToken();
      const invitation = await db.transaction(async (tx) => {
        // Si ya había una invitación pendiente para ese email, la reemplazamos:
        // así hay un solo link válido por persona y el viejo deja de funcionar.
        await tx
          .delete(invitations)
          .where(
            and(eq(invitations.businessId, businessId), eq(invitations.email, input.email), isNull(invitations.acceptedAt)),
          );
        const [row] = await tx
          .insert(invitations)
          .values({
            businessId,
            email: input.email,
            role: input.role,
            tokenHash: hashToken(token),
            invitedBy,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          })
          .returning();
        return row!;
      });
      return { invitation, token };
    },

    async revokeInvitation(businessId, invitationId) {
      const deleted = await db
        .delete(invitations)
        .where(and(eq(invitations.id, invitationId), eq(invitations.businessId, businessId), isNull(invitations.acceptedAt)))
        .returning({ id: invitations.id });
      return deleted.length > 0;
    },

    async previewInvitation(token) {
      const [row] = await db
        .select({ businessName: businesses.name, role: invitations.role, email: invitations.email })
        .from(invitations)
        .innerJoin(businesses, eq(businesses.id, invitations.businessId))
        .where(and(eq(invitations.tokenHash, hashToken(token)), pending()))
        .limit(1);
      return row ?? null;
    },

    async acceptInvitation(token, user) {
      return db.transaction(async (tx) => {
        // FOR UPDATE bloquea la fila hasta terminar: si el link se abre dos veces a la vez,
        // la segunda espera y después ve que ya está aceptada.
        const [invitation] = await tx
          .select()
          .from(invitations)
          .where(and(eq(invitations.tokenHash, hashToken(token)), pending()))
          .for('update')
          .limit(1);
        if (!invitation) throw new InvitationNotFoundError();
        // El link solo sirve para el email invitado: si se reenvía, otra persona no puede usarlo.
        if (invitation.email !== user.email) throw new InvitationEmailMismatchError(invitation.email);

        // onConflictDoNothing: si ya era miembro, se queda con el rol que tenía.
        await tx
          .insert(memberships)
          .values({ businessId: invitation.businessId, userId: user.id, role: invitation.role })
          .onConflictDoNothing();
        await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invitation.id));
        return { businessId: invitation.businessId };
      });
    },

    async removeMember(businessId, userId) {
      const where = and(eq(memberships.businessId, businessId), eq(memberships.userId, userId));
      const [member] = await db.select({ role: memberships.role }).from(memberships).where(where).limit(1);
      if (!member) return false;
      if (member.role === 'owner') throw new CannotRemoveOwnerError();
      await db.delete(memberships).where(where);
      return true;
    },
  };
}
