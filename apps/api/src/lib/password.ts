import { hash, verify } from '@node-rs/argon2';

// Argon2id es el algoritmo recomendado hoy para guardar contraseñas.
// Es lento a propósito: probar millones de contraseñas robadas cuesta mucho.
// @node-rs/argon2 trae binarios ya compilados, así que anda en Windows sin instalar nada.

export function hashPassword(plain: string): Promise<string> {
  // El hash incluye la sal y los parámetros, así que no hace falta guardarlos aparte.
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    // Un hash con formato inválido cuenta como contraseña incorrecta.
    return false;
  }
}
