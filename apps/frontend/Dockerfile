# syntax=docker/dockerfile:1

# ── Stage deps: instala todas las dependencias (incluye dev) ─────
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN npm ci

# ── Stage build: compila el frontend (incluye prebuild pdf worker) ─
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build --workspace=frontend

# ── Stage runtime: nginx sirviendo el build estático ──────────────
FROM nginx:1.27-alpine AS runtime

COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist/frontend/browser/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]