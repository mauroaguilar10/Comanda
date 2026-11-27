import { describe, it } from 'vitest';

// Casos que tienen que cumplir las rutas de autenticación (docs/etapa-1.md, paso 4).
// Cada it.todo se convierte en un test real cuando escribas routes.ts.

describe('POST /auth/register', () => {
  it.todo('crea el usuario, devuelve 201 con MeResponse y pone la cookie de sesión');
  it.todo('guarda el email en minúsculas');
  it.todo('responde 409 si el email ya está registrado');
  it.todo('responde 400 si la contraseña tiene menos de 10 caracteres');
  it.todo('nunca devuelve passwordHash');
});

describe('POST /auth/login', () => {
  it.todo('con email y contraseña correctos devuelve 200 y pone la cookie');
  it.todo('con contraseña incorrecta responde 401');
  it.todo('con un email que no existe responde el mismo 401 y el mismo mensaje');
});

describe('POST /auth/logout', () => {
  it.todo('revoca la sesión: después /auth/me responde 401');
});

describe('GET /auth/me', () => {
  it.todo('sin cookie responde 401');
  it.todo('con sesión devuelve el usuario y sus negocios con el rol');
});
