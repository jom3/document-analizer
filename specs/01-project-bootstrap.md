# SPEC 01 — Bootstrap del proyecto (arranque inicial)

> **Status:** Borrador
> **Depends on:** —
> **Date:** 2026-08-13
> **Objective:** Arrancar el proyecto como un monorepo npm workspaces con frontend Angular y backend NestJS conectado a PostgreSQL vía Prisma, sin dockerizar la aplicación.

## Scope

**In:**

- `git init` + `.gitignore` en la raíz del proyecto.
- Raíz con `package.json` configurado con npm workspaces (`apps/*`).
- App Angular en `apps/frontend` (Angular CLI, Signals, Router).
- App NestJS en `apps/backend` (Nest CLI, REST).
- `GET /health` en el backend que verifica conectividad con PostgreSQL vía Prisma.
- Landing mínima en el frontend que consume `/health` a través de un proxy de desarrollo.
- Prisma configurado solo como conexión (`datasource` + `generator`), sin modelos ni migraciones.
- Contenedor standalone de PostgreSQL (`postgres:18.4-alpine3.24`) documentado con un comando `docker run`, en puerto `5433`, con volumen persistente.
- Fijar versión de Node (`engines` + `.nvmrc`) en Node 24.
- Variables de entorno con `.env.example` versionado y `.env` ignorado.

**Out of scope (for future specs):**

- Dockerización de la aplicación (Dockerfile / docker-compose de frontend y backend).
- Autenticación (JWT).
- Modelos de datos y migraciones de Prisma.
- Funcionalidad de documentos, IA, RAG o procesamiento de PDFs.
- CI/CD.

## Data model

Este spec no introduce estructuras de datos de negocio. Solo define variables de configuración:

```text
# apps/backend/.env.example
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/document_analyzer?schema=public"
```

El esquema Prisma (`apps/backend/prisma/schema.prisma`) contiene únicamente `generator client` y `datasource postgresql`. No define modelos.

## Implementation plan

1. Inicializar git y crear archivos base en la raíz: `git init`, `.gitignore` (node_modules, dist, .env), `.nvmrc` (`24`) y `package.json` raíz con `workspaces: ["apps/*"]` y `engines.node: ">=24"`. Verificación: `git status` muestra los archivos.
2. Generar la app Angular en `apps/frontend` con Angular CLI. Verificación: `npm run build` dentro de `apps/frontend` compila sin errores.
3. Generar la app NestJS en `apps/backend` con Nest CLI. Verificación: `npm run build` dentro de `apps/backend` compila sin errores.
4. Configurar scripts de raíz (`dev`, `build`) que ejecuten ambos workspaces con `npm --workspace`. Verificación: `npm install` en la raíz instala ambos y `npm run build` compila los dos.
5. Agregar módulo de health en el backend: `HealthController` con `GET /health` que responde `{ status: 'ok' }`. Verificación: levantar backend y hacer `GET localhost:3000/health`.
6. Configurar Prisma en `apps/backend`: instalar `prisma` y `@prisma/client`, crear `schema.prisma` (sin modelos), `.env` y `.env.example`. Verificación: `npx prisma generate` termina sin errores.
7. Extender `/health` para verificar la base: ejecutar `SELECT 1` vía Prisma `$queryRaw` y responder `db: 'up'` o `db: 'down'`. Verificación: con el contenedor corriendo responde `up`.
8. Documentar el contenedor standalone de Postgres en README con el comando `docker run` (imagen `postgres:18.4-alpine3.24`, puerto `5433:5432`, volumen nombrado). Verificación: ejecutar el comando y confirmar que el contenedor queda activo.
9. Crear la landing del frontend que llama a `/health` a través de un proxy de desarrollo de Angular (`/api` → backend) y muestra el estado. Verificación: abrir el frontend y ver el estado del backend y de la base.

## Acceptance criteria

- [ ] `git init` ejecutado y `.gitignore` ignora `node_modules`, `dist` y `.env`.
- [ ] `npm install` en la raíz instala las dependencias de ambos workspaces sin errores.
- [ ] `npm run build` compila frontend y backend sin errores.
- [ ] `npm run dev` levanta frontend (puerto 4200) y backend (puerto 3000).
- [ ] `GET http://localhost:3000/health` responde 200 con `{ status: 'ok', db: 'up' }` con el contenedor activo.
- [ ] La landing del frontend carga y muestra el estado consumido desde `/health` vía proxy.
- [ ] El contenedor `document-analyzer-db` usa la imagen `postgres:18.4-alpine3.24`, expone `5433` y tiene volumen persistente.
- [ ] `apps/backend/.env.example` está versionado y `apps/backend/.env` está en `.gitignore`.
- [ ] `.nvmrc` y `engines.node` fijan Node 24.
- [ ] No existe Dockerfile ni docker-compose para la aplicación en el repo.

## Decisions

- **Sí:** monorepo con npm workspaces (`apps/frontend`, `apps/backend`). Simple y sin tooling extra.
- **No:** Nx. Complejidad innecesaria para este arranque.
- **Sí:** npm como gestor de paquetes.
- **Sí:** Docker solo para un contenedor standalone de PostgreSQL, independiente del proyecto. Permite una base local permanente sin instalar Postgres nativo.
- **No:** Dockerizar la aplicación. La dockerización de frontend/backend va en un spec aparte.
- **Sí:** Prisma solo como conexión (sin modelos ni migraciones). Los modelos llegan con la funcionalidad en specs futuros.
- **Sí:** credenciales de desarrollo `postgres` / `postgres` / `document_analyzer` y puerto `5433`.
- **Sí:** Node 24 (la versión instalada localmente), con `engines` y `.nvmrc`. Es probable que cambie en el futuro; el pin es fácil de migrar.
- **No:** autenticación en este spec.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| La versión de Node podría cambiar en el futuro. | Pin documentado en `.nvmrc` y `engines`; migración trivial. |
| El contenedor standalone depende de tener Docker instalado localmente. | Alternativa: instalar Postgres nativo y apuntar `DATABASE_URL` a `localhost:5433`. |
| Prisma sin modelos no genera client tipado para queries de dominio. | Se usa `$queryRaw` solo para el health check; los modelos llegan en specs futuros. |
| Hoisting de npm workspaces podría generar conflictos de versiones entre Angular y NestJS. | Mantener las dependencias de cada CLI en su propio workspace. |

## What is **not** in this spec

- Dockerización de la aplicación (Dockerfile / docker-compose de frontend y backend).
- Autenticación (JWT).
- Modelos de datos y migraciones de Prisma.
- Funcionalidad de documentos, IA, RAG o procesamiento de PDFs.
- CI/CD.

Cada uno de esos puntos, si se implementa, irá en su propio spec.
