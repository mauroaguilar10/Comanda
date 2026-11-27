# Contexto para Claude Code

Comanda: SaaS de pedidos en tiempo real de Mauro Aguilar (estudiante de Ingeniería en Sistemas, Villa Mercedes, San Luis). Proyecto 2 de su plan; se muestra como caso de estudio en su portfolio (repo mauroaguilar10/PTF).
El usuario escribe en español rioplatense; respondé en español.

## Decisiones tomadas

- Nicho inicial: rotiserías, pizzerías y hamburgueserías de Villa Mercedes. El núcleo es general: estados de pedido, tipos de entrega y plantillas configurables por negocio (`business_type`), para extenderlo a otros rubros sin tocar la base.
- Monolito modular en TypeScript. Monorepo pnpm: `apps/api` (Fastify, después Socket.IO y worker pg-boss), `apps/web` (React + Vite, CSS propio, sin Tailwind ni librerías de componentes), `packages/shared` (esquemas Zod y tipos).
- PostgreSQL 17 con Drizzle (desde la etapa 1). Multi-tenant con `business_id` en cada tabla. Montos en centavos.
- Auth propia: sesiones en cookie httpOnly y Argon2.
- Módulos del backend en `apps/api/src/modules/<módulo>`. Un módulo no lee tablas de otro: usa su servicio o sus eventos (tabla `outbox_events`). El CRM con agente IA (proyecto 3) entra como módulo `crm` escuchando eventos.
- Infra: web en Cloudflare Pages (app. y pedir.mauroaglr.com), API y Postgres en un VPS con Docker Compose (api.mauroaglr.com), archivos en R2.

## Forma de trabajar

- Mauro quiere aprender: explicá el porqué de cada cambio. Desde la etapa 1 él escribe los módulos con guía; preguntá antes de escribir código grande.
- Cada cambio en una rama con PR; el CI tiene que quedar en verde.
- Antes de dar algo por terminado: `pnpm typecheck`, `pnpm test` y `pnpm build`.
- La app de la API se arma con `buildApp(deps)` para poder testear con `app.inject()` y mocks, sin levantar servidor ni base.
- Mobile first y accesible: HTML semántico, foco visible, contraste suficiente.
