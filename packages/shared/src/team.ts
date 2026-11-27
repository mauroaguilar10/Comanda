import { z } from 'zod';
import { emailSchema, roleSchema } from './auth.js';

// Contratos del equipo de un local: miembros e invitaciones.

// Se puede invitar a cualquier rol menos dueño: el local tiene un solo dueño, el que lo creó.
export const invitableRoleSchema = z.enum(['manager', 'kitchen', 'driver'], 'Elegí un rol');
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

// POST /businesses/:businessId/invitations
export const invitationInputSchema = z.object({ email: emailSchema, role: invitableRoleSchema });
export type InvitationInput = z.infer<typeof invitationInputSchema>;

// z.coerce.date: la API manda la fecha como texto ISO en el JSON y acá vuelve a ser Date.
export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: invitableRoleSchema,
  expiresAt: z.coerce.date(),
});
export type InvitationResponse = z.infer<typeof invitationSchema>;

// Respuesta de crear una invitación: la única vez que se ve el token (en la base está solo su hash).
export const createdInvitationSchema = invitationSchema.extend({ token: z.string() });
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const memberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});
export type Member = z.infer<typeof memberSchema>;

// GET /businesses/:businessId/team
export const teamResponseSchema = z.object({
  members: z.array(memberSchema),
  // Solo las pendientes (sin aceptar y sin vencer).
  invitations: z.array(invitationSchema),
});
export type TeamResponse = z.infer<typeof teamResponseSchema>;

// GET /invitations/:token: lo que ve quien abre el link, antes de aceptar.
export const invitationPreviewSchema = z.object({
  businessName: z.string(),
  role: invitableRoleSchema,
  email: z.string(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

// POST /invitations/:token/accept
export const acceptInvitationResponseSchema = z.object({ businessId: z.uuid() });
