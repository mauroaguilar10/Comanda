import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { generateToken, hashToken } from './tokens.js';

describe('password', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const stored = await hashPassword('una-clave-larga');

    expect(stored).not.toContain('una-clave-larga');
    expect(await verifyPassword(stored, 'una-clave-larga')).toBe(true);
    expect(await verifyPassword(stored, 'otra-clave')).toBe(false);
  });

  it('genera hashes distintos para la misma contraseña (por la sal)', async () => {
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('trata un hash roto como contraseña incorrecta', async () => {
    expect(await verifyPassword('no-es-un-hash', 'x')).toBe(false);
  });
});

describe('tokens', () => {
  it('genera tokens distintos y largos', () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('el hash es estable y no revela el token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });
});
