import { createHash, randomBytes } from 'node:crypto';

// Token aleatorio de 32 bytes (256 bits): imposible de adivinar.
// base64url lo deja apto para cookies y URLs.
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Guardamos el hash del token, no el token. Con SHA-256 alcanza (no hace falta Argon2)
// porque el token ya es aleatorio y largo: no se puede probar por fuerza bruta.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
