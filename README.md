# Comanda

SaaS de pedidos en tiempo real para rotiserías, pizzerías y comercios con delivery. El cliente pide desde un link o un QR, la cocina ve el pedido al instante y el dueño mira sus ventas en un panel.

Estado: **etapa 0** (esqueleto). El documento de arquitectura tiene el plan completo.

## Qué hay en el repo

```
apps/
  api/        Backend: Node + Fastify (después: Socket.IO, worker)
  web/        Frontend: React + Vite (tienda, panel, cocina, repartidor)
packages/
  shared/     Esquemas Zod y tipos que usan la API y la web
.github/      CI con GitHub Actions
docker-compose.yml   PostgreSQL para desarrollo
```

Es un **monorepo** con pnpm workspaces: un solo repo, un solo `pnpm install`, y la web importa los tipos de la API desde `@comanda/shared`.

## Requisitos

- Node 22 LTS
- pnpm: viene con Node, se activa con `corepack enable`
- Docker Desktop (en Windows, con WSL2) para la base de datos

## Arrancar en local

```bash
pnpm install
cp .env.example .env      # en Windows PowerShell: copy .env.example .env
pnpm db:up                # levanta PostgreSQL en Docker
pnpm dev                  # API en :3000 y web en :5173
```

Abrí http://localhost:5173: tiene que decir API `ok` y Base de datos `ok`. Si la base dice `error`, revisá que Docker esté corriendo.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | API y web en modo desarrollo, se recargan al guardar |
| `pnpm test` | Corre los tests (Vitest) |
| `pnpm typecheck` | Chequea los tipos de TypeScript sin compilar |
| `pnpm build` | Compila todo como para producción |
| `pnpm db:up` / `pnpm db:down` | Prende o apaga PostgreSQL |

## Stack

TypeScript, React, Vite, Fastify, PostgreSQL, Zod y Vitest. En las próximas etapas se suman Socket.IO, Drizzle, pg-boss, Cloudflare R2 y Mercado Pago.
