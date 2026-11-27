# Comanda

[![CI](https://github.com/mauroaguilar10/Comanda/actions/workflows/ci.yml/badge.svg)](https://github.com/mauroaguilar10/Comanda/actions/workflows/ci.yml)

SaaS de pedidos en tiempo real para rotiserías, pizzerías y comercios con delivery. El cliente pide desde un link o un QR, la cocina ve el pedido al instante y el dueño sigue sus ventas desde un panel.

Empieza por los locales de comida de Villa Mercedes (San Luis, Argentina), pero el núcleo es general: estados de pedido, tipos de entrega y plantillas se configuran por negocio, para sumar otros rubros sin tocar la base de datos.

## Arquitectura

Decisiones de diseño del sistema; las que dependen de módulos todavía no construidos se implementan en las próximas etapas.

- **Monolito modular en TypeScript**, en un monorepo con pnpm workspaces: API, web y un paquete compartido de esquemas y tipos.
- **Multi-tenant:** cada tabla lleva `business_id`; un mismo despliegue atiende a muchos negocios con sus datos aislados.
- **Módulos desacoplados:** un módulo no lee las tablas de otro; se comunican por su servicio o por eventos (patrón outbox). Así entra después un CRM con agente de IA sin tocar el resto.
- **Contratos compartidos:** los esquemas Zod de `@comanda/shared` validan en la API y tipan la web, así que un cambio en el contrato rompe el build y no producción.
- **Testeable sin infraestructura:** la API se arma con `buildApp(deps)` y se prueba con `app.inject()` y dependencias simuladas, sin levantar servidor ni base.
- **Dinero en centavos** (enteros), para no arrastrar errores de punto flotante.

## Stack

| Capa | Tecnologías |
| --- | --- |
| API | Node.js, Fastify, Zod · después Socket.IO y colas con pg-boss |
| Web | React, Vite, CSS propio |
| Datos | PostgreSQL 17 · Drizzle ORM desde la etapa 1 |
| Auth | Sesiones en cookie httpOnly y Argon2 (etapa 1) |
| Calidad | TypeScript estricto, Vitest, CI con GitHub Actions |
| Infra | Docker Compose, Cloudflare Pages, Cloudflare R2 |

## Estado

- **Etapa 0 completa:** esqueleto del monorepo, API con chequeo de salud y base, web que la consume, PostgreSQL en Docker y CI.
- **Etapa 1 en curso:** registro, login y sesiones con cookie httpOnly y Argon2; negocios multi-tenant con roles (dueño, encargado, cocina, reparto) chequeados en el backend; pantallas de login, registro y alta del local. Faltan las invitaciones de empleados y el catálogo con fotos.

---

## Desarrollo local

### Qué hay en el repo

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

### Requisitos

- Node 22 LTS
- pnpm: viene con Node, se activa con `corepack enable`
- Docker Desktop (en Windows, con WSL2) para la base de datos

### Arrancar en local

```bash
pnpm install
cp .env.example .env      # en Windows PowerShell: copy .env.example .env
pnpm db:up                # levanta PostgreSQL en Docker
pnpm db:migrate           # crea las tablas
pnpm dev                  # API en :3000 y web en :5173
```

Abrí http://localhost:5173: tiene que decir API `ok` y Base de datos `ok`. Si la base dice `error`, revisá que Docker esté corriendo.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | API y web en modo desarrollo, se recargan al guardar |
| `pnpm test` | Corre los tests (Vitest) |
| `pnpm typecheck` | Chequea los tipos de TypeScript sin compilar |
| `pnpm build` | Compila todo como para producción |
| `pnpm db:up` / `pnpm db:down` | Prende o apaga PostgreSQL |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm db:generate` | Genera una migración nueva después de cambiar `schema.ts` |

## Licencia

[MIT](LICENSE) © 2026 Mauro Aguilar
