import { z } from 'zod';

// Contratos de la etapa 1. La API valida lo que entra con estos esquemas
// y la web los usa para validar el formulario antes de mandarlo.

export const roleSchema = z.enum(['owner', 'manager', 'kitchen', 'driver']);
export type Role = z.infer<typeof roleSchema>;

// Exportado para que las invitaciones normalicen el email igual que el registro.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Email inválido'));
const email = emailSchema;
const password = z.string().min(10, 'Mínimo 10 caracteres').max(200);

// POST /auth/register
export const registerInputSchema = z.object({
  name: z.string().trim().min(2, 'Poné tu nombre').max(100),
  email,
  password,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

// POST /auth/login
export const loginInputSchema = z.object({
  email,
  password: z.string().min(1, 'Poné tu contraseña'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

// GET /auth/me (y respuesta de register y login)
export const meResponseSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.string(), name: z.string() }),
  businesses: z.array(z.object({ id: z.uuid(), name: z.string(), slug: z.string(), role: roleSchema })),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// POST /businesses
export const createBusinessInputSchema = z.object({
  name: z.string().trim().min(2, 'Poné el nombre del local').max(100, 'Máximo 100 caracteres'),
  // Solo minúsculas, números y guiones: va en la URL de la tienda.
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Mínimo 3 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones'),
  phone: z.string().trim().max(30, 'Máximo 30 caracteres').optional(),
  address: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessInputSchema>;

// Respuesta de POST /businesses y GET /businesses/:businessId
export const businessSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  businessType: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  timezone: z.string(),
});
export type BusinessResponse = z.infer<typeof businessSchema>;

// Formato común de error de la API.
// `fields` viene en los 400: los errores de cada campo del formulario.
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.array(z.string()).optional()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
