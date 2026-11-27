# Etapa 1: login, negocios y roles

**Objetivo de la etapa:** un dueño se registra, crea su local, invita a un empleado y carga el menú. Esta guía cubre la primera mitad: registro, login y negocios con roles.

## Qué ya está hecho (la base)

| Archivo | Qué hace |
| --- | --- |
| `apps/api/src/db/schema.ts` | Tablas `users`, `sessions`, `businesses`, `memberships` y el enum `role` |
| `apps/api/drizzle/0000_etapa1_auth.sql` | La migración generada a partir del esquema |
| `apps/api/src/db/client.ts` | Crea la conexión de Drizzle |
| `apps/api/src/lib/password.ts` | `hashPassword` y `verifyPassword` con Argon2 |
| `apps/api/src/lib/tokens.ts` | Tokens aleatorios y su hash |
| `apps/api/src/modules/auth/sessions.ts` | `SessionService`: crear, resolver y revocar sesiones |
| `apps/api/src/modules/businesses/memberships.ts` | `MembershipLookup`: qué rol tiene alguien en un negocio |
| `apps/api/src/plugins/auth.ts` | Lee la cookie y deja `request.user`; guardias `requireAuth` y `requireRole` |
| `apps/api/src/test/fakes.ts` | Versiones en memoria de esos servicios para los tests |
| `packages/shared/src/auth.ts` | Esquemas Zod de lo que entra y sale: registro, login, `/auth/me`, crear negocio |

Para preparar tu base local:

```bash
pnpm install
pnpm db:up
pnpm db:migrate   # crea las tablas
pnpm db:studio    # opcional: abre un visor de la base en el navegador
```

## Lo que escribís vos

Andá en este orden. Cada paso termina con tests en verde y un commit.

### 1. Repositorio de usuarios

Archivo nuevo: `apps/api/src/modules/auth/users.ts`.

Seguí el mismo patrón que `sessions.ts`: una interfaz y una función que la implementa con Drizzle.

```ts
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(data: { email: string; name: string; passwordHash: string }): Promise<User>;
}
export function createUserRepository(db: Db): UserRepository { /* ... */ }
```

Después agregá un `fakeUsers()` en `test/fakes.ts`, como los otros.

### 2. Rutas de autenticación

Archivo nuevo: `apps/api/src/modules/auth/routes.ts`. Es un plugin de Fastify que recibe sus dependencias por opciones:

```ts
export async function authRoutes(app: FastifyInstance, opts: { users: UserRepository; sessions: SessionService; memberships: ... }) {
  app.post('/register', async (request, reply) => { /* ... */ });
  // ...
}
```

Registralo en `app.ts`, donde está el comentario de la etapa 1, con `prefix: '/auth'`. Vas a tener que sumar `users` a `AppDeps` y crearlo en `server.ts`.

| Ruta | Qué hace | Respuesta |
| --- | --- | --- |
| `POST /auth/register` | Valida con `registerInputSchema`, hashea la contraseña, crea el usuario, crea la sesión y pone la cookie | 201 con `MeResponse` · 409 si el email ya existe · 400 si los datos no validan |
| `POST /auth/login` | Busca por email, verifica la contraseña, crea la sesión y pone la cookie | 200 con `MeResponse` · 401 si falla |
| `POST /auth/logout` | Revoca la sesión de la cookie y la borra | 204 |
| `GET /auth/me` | Con `requireAuth`, devuelve el usuario y sus negocios | 200 con `MeResponse` · 401 |

Para poner la cookie: `app.sessionCookie.set(reply, token, expiresAt)`. Para borrarla: `app.sessionCookie.clear(reply)`.

**Reglas de seguridad que importan:**

- En login, el mismo mensaje y el mismo código para "no existe el email" y "contraseña incorrecta". Si no, un atacante averigua qué emails tienen cuenta.
- Si el email no existe, igual llamá a `verifyPassword` con un hash cualquiera, para que la respuesta tarde lo mismo.
- Nunca devuelvas `passwordHash` en una respuesta. Armá el objeto a mano o validalo con `meResponseSchema`.
- El esquema Zod ya pasa el email a minúsculas: usá siempre el valor que devuelve `parse`.

`GET /auth/me` necesita la lista de negocios con su rol. Agregá un método `listForUser(userId)` en `memberships.ts` que haga un join con `businesses`.

### 3. Negocios

Archivo nuevo: `apps/api/src/modules/businesses/routes.ts`, registrado con `prefix: '/businesses'`.

| Ruta | Quién | Qué hace |
| --- | --- | --- |
| `POST /businesses` | Cualquier usuario logueado (`requireAuth`) | Crea el negocio y la membresía `owner` de quien lo crea, **en una transacción**. 409 si el slug está tomado |
| `GET /businesses/:businessId` | Cualquier miembro: `requireRole(memberships, 'manager', 'kitchen', 'driver')` | Devuelve los datos del negocio |

La transacción es clave: si se crea el negocio pero falla la membresía, queda un local sin dueño. Con Drizzle:

```ts
await db.transaction(async (tx) => {
  const [business] = await tx.insert(businesses).values(...).returning();
  await tx.insert(memberships).values({ businessId: business.id, userId, role: 'owner' });
});
```

### 4. Tests

Hay una lista de casos en `apps/api/src/modules/auth/routes.test.ts` marcados con `it.todo`. Convertí cada uno en un test real usando los fakes y `app.inject()`, como en `plugins/auth.test.ts`. Para leer la cookie de una respuesta: `res.cookies`.

## Cómo saber que terminaste

- `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- Con la API corriendo, desde la terminal (en PowerShell usá `curl.exe`):

```bash
curl -i -c cookies.txt -H "content-type: application/json" \
  -d '{"name":"Mauro","email":"mauro@example.com","password":"una-clave-larga"}' \
  http://localhost:3000/auth/register
curl -i -b cookies.txt http://localhost:3000/auth/me
```

- Abrís un PR desde tu rama y el CI queda en verde. Yo lo reviso y te dejo comentarios.

## Lo que sigue

Pantallas de login y registro en la web, invitaciones de empleados y catálogo con fotos.
