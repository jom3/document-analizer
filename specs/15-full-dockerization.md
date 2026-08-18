# SPEC 15 — Dockerización completa de la aplicación

> **Status:** Implementado
> **Depends on:** — (aplica sobre la aplicación existente de SPEC 01–14)
> **Date:** 2026-08-17
> **Objective:** Dockerizar backend y frontend para que todo el stack (db, redis, backend, frontend) se levante con `docker compose up` en producción/portfolio, manteniendo el flujo de desarrollo local intacto.

## Scope

**In:**

- `apps/backend/Dockerfile`: imagen multi-stage (deps → build → runtime) con Node 24, construida desde la raíz del repo usando npm workspaces (único `package-lock.json`).
- `apps/backend/docker-entrypoint.sh`: aplica `prisma migrate deploy` y luego arranca la app (`node dist/src/main`).
- `apps/frontend/Dockerfile`: imagen multi-stage que ejecuta `ng build` (incluye el prebuild `copy-pdf-worker.mjs`) y sirve el build estático con nginx.
- `apps/frontend/nginx.conf`: sirve los estáticos del build, redirige `/api` al servicio `backend:3000` y hace fallback SPA.
- `docker-compose.yml` extendido: servicios `db`, `redis`, `backend` y `frontend`, todos con healthcheck.
- Build del frontend vía nginx en el puerto host `4200`; backend en `3000`; se mantienen `5433` (db) y `6379` (redis).
- Un único `.env` en la raíz del repo (`env_file`) para las variables de entorno sensibles y de configuración.
- Volumen nombrado para el almacenamiento de documentos (`STORAGE_PATH`) que persiste entre restarts.
- `.dockerignore` en la raíz.
- `.env.example` en la raíz documentando todas las variables.
- `README.md` actualizado con la sección de despliegue (`docker compose up --build`).

**Out of scope (for future specs):**

- Despliegue real: VPS, dominio, TLS, reverse proxy externo (Caddy/Traefik).
- Migrar el flujo de desarrollo local a Docker (`npm run dev` y `proxy.conf.json` se mantienen).
- Pipeline de CI/CD.
- Orquestación (Kubernetes, Docker Swarm) y autoescalado.
- Agregación de logs/monitoring (ELK, Prometheus, etc.).
- Seguridad de red avanzada (redes internas aisladas, secrets manager).

## Data model

Esta feature no introduce estructuras de datos nuevas. Reutiliza el modelo existente (SPEC 01–12). Los únicos "datos" nuevos son artefactos de infraestructura: volúmenes nombrados de Docker (`document-analyzer-db-data`, `document-analyzer-redis-data`, `document-analyzer-storage`) y la red por defecto de Compose.

## Implementation plan

1. Crear `.dockerignore` en la raíz: `node_modules/`, `dist/`, `.env`, `.git/`, `storage/`, `coverage/`, `apps/*/node_modules/`, `apps/*/dist/`. Verificación: el contexto de build no incluye esos directorios (`docker build` no envía archivos pesados).
2. Crear `apps/backend/Dockerfile` multi-stage con contexto raíz: stage de deps con `npm ci`, stage de build con `nest build` y `prisma generate`, stage runtime slim que copia `dist/` y `node_modules` de producción. Verificación: la imagen builda con `docker build -f apps/backend/Dockerfile .`.
3. Crear `apps/backend/docker-entrypoint.sh` (ejecutable) que corre `npx prisma migrate deploy` y luego `exec node dist/src/main`. Verificación: el script aplica migraciones y arranca la app con `DATABASE_URL` apuntando al servicio `db` del stack.
4. Crear `apps/frontend/Dockerfile` multi-stage con contexto raíz: stage de build con `npm ci` y `npm run build --workspace=frontend`, stage de nginx que copia `apps/frontend/dist/*/browser` y `nginx.conf`. Verificación: la imagen builda con `docker build -f apps/frontend/Dockerfile .`.
5. Crear `apps/frontend/nginx.conf`: `listen 80`, `root` del build, `location /api/` con `proxy_pass http://backend:3000`, fallback a `index.html` para rutas SPA, headers básicos. Verificación: nginx arranca sin errores de sintaxis (`nginx -t`).
6. Extender `docker-compose.yml`: agregar healthchecks a `db` (`pg_isready`) y `redis` (`redis-cli ping`); agregar el servicio `backend` (build, `env_file: .env`, volumen `document-analyzer-storage:/app/storage`, healthcheck contra `/health`, `depends_on` con `condition: service_healthy` de `db` y `redis`); agregar el servicio `frontend` (build, `ports: "4200:80"`, `depends_on: backend`). Verificación: `docker compose config` valida el archivo.
7. Crear `.env.example` en la raíz con todas las variables del stack: `DATABASE_URL` (apuntando a `db:5432`), `REDIS_URL` (apuntando a `redis:6379`), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `RESEND_API_KEY`, `RESEND_FROM`, `FRONTEND_URL` (`http://localhost:4200`), `STORAGE_PATH` (`./storage`), `OPENAI_API_KEY`, `OPENAI_MODEL`, `EMBEDDING_MODEL`, `CHAT_MODEL`. Verificación: copiando `.env.example` a `.env`, el stack levanta con esos valores.
8. Actualizar `README.md`: nueva sección de despliegue con `cp .env.example .env`, `docker compose up -d --build`, cómo inspeccionar healthchecks y detener el stack; aclarar que el flujo de dev local no cambia. Verificación: las instrucciones son ejecutables tal cual.
9. Verificación final: `docker compose up -d --build`, esperar a que los 4 servicios queden healthy, y regresión funcional manual completa (login/registro, subida de documento, procesamiento, chat) contra `http://localhost:4200`.

## Acceptance criteria

- [ ] `docker compose up -d --build` levanta los servicios `db`, `redis`, `backend` y `frontend` sin errores.
- [ ] Los 4 servicios quedan en estado `healthy` según sus healthchecks.
- [ ] El frontend se sirve en `http://localhost:4200` desde nginx (build estático, no `ng serve`).
- [ ] Una petición a `http://localhost:4200/api/...` llega al backend (proxy nginx correcto).
- [ ] Al arrancar el backend, las migraciones de Prisma pendientes se aplican automáticamente.
- [ ] Un documento subido persiste tras `docker compose down` + `docker compose up -d` (volumen nombrado).
- [ ] Los secretos y configuración se leen del `.env` raíz; el backend funciona con `OPENAI_API_KEY` y las credenciales de JWT provistas.
- [ ] El flujo de dev local (`npm run dev` + `proxy.conf.json` + Postgres/Redis en contenedores) sigue funcionando sin cambios.
- [ ] Las imágenes se construyen desde la raíz con npm workspaces y `.dockerignore` evita enviar `node_modules`/`dist` al contexto.
- [ ] `README.md` documenta los pasos de despliegue y aclara que el dev local no cambia.
- [ ] Regresión funcional en el stack dockerizado: login/registro, subida de documento, procesamiento y chat operativos.

## Decisions

- **Sí:** Dockerfiles multi-stage con contexto raíz y npm workspaces. Hay un único `package-lock.json` en la raíz; construir cada app desde su propio directorio rompería el `npm ci`. El stage de runtime queda slim para imágenes chicas de portfolio.
- **Sí:** frontend servido por nginx con proxy `/api → backend:3000` y fallback SPA. Elimina el uso de `proxy.conf.json` en producción; el build queda reproducible y el proxy vive en la misma imagen.
- **Sí:** entrypoint con `prisma migrate deploy`. Aplica migraciones pendientes en cada arranque del backend, sin pasos manuales para quien levante el stack.
- **Sí:** un único `.env` en la raíz con `env_file`. Un solo lugar para configurar secretos y URLs del stack; `.env` ya está en `.gitignore`.
- **Sí:** volumen nombrado `document-analyzer-storage` para `STORAGE_PATH`. Los uploads sobreviven a restarts y no ensucian el repo.
- **Sí:** healthchecks en los 4 servicios con `depends_on: condition: service_healthy` entre backend y db/redis. Evita arranques con dependencias no listas (migraciones fallidas, 502 del proxy).
- **Sí:** mantener los puertos host actuales (3000, 4200, 5433, 6379). Cero cambios para quien ya usa el proyecto; el README y los `.env` siguen siendo válidos.
- **Sí:** dev local intacto. Docker suma una vía de producción/portfolio; no se toca el workflow actual de desarrollo.
- **No:** despliegue real (VPS/dominio/TLS), migrar el dev a Docker, CI/CD, orquestación ni observabilidad agregada. Cada uno iría en su propio spec.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `bcrypt` requiere compilar binarios nativos; falla en el runtime slim. | Compilar/instalar dependencias nativas en el stage de deps/build y copiar solo `node_modules` de producción al runtime; bcrypt 6 incluye prebuilt binaries. |
| `prisma generate` no se ejecuta en el build y el cliente no está disponible en runtime. | Ejecutar `prisma generate` en el stage de build y verificar el cliente en el stage runtime. |
| Puertos host 3000/4200 ocupados en la máquina. | Puertos configurables vía variables en el compose; README documenta el conflicto. |
| nginx devuelve 502 si el backend aún no está listo. | `depends_on` con `condition: service_healthy` del backend + healthcheck de nginx; reintento manual documentado. |
| Falta el `.env` raíz y el stack arranca con valores vacíos (secrets). | `env_file` falla de forma explícita si el archivo no existe; README instruye `cp .env.example .env` antes del `up`. |
| El build del frontend (ng build + pdf worker) agota memoria/disco en el contenedor. | `copy-pdf-worker.mjs` corre en `prebuild`; si hiciera falta, configurar `NODE_OPTIONS`/límites en el build. |
| El entrypoint no tiene permisos de ejecución (Windows). | Documentar `chmod +x` (o usar `sh entrypoint.sh`) en el Dockerfile para que sea portable. |

## What is **not** in this spec

- Despliegue real: VPS, dominio, TLS, reverse proxy externo.
- Migrar el flujo de desarrollo local a Docker.
- Pipeline de CI/CD.
- Orquestación (Kubernetes, Swarm) y autoescalado.
- Agregación de logs/monitoring.

Cada uno de esos puntos, si se implementa, irá en su propio spec.