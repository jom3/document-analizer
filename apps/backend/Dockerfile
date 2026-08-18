# syntax=docker/dockerfile:1

# ── Stage deps: instala TODAS las dependencias (incluye dev) ─────
FROM node:24-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN npm ci

# ── Stage build: genera el cliente Prisma y compila el backend ───
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate --schema apps/backend/prisma/schema.prisma \
    && npm run build --workspace=backend

# ── Stage runtime: solo dependencias de producción del backend ────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV PORT=3000

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev --workspace=backend \
    && npm cache clean --force \
    && rm -rf /root/.npm /root/.cache \
    && apk del python3 make g++

COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/prisma ./prisma
COPY --from=build /app/apps/backend/prisma.config.ts ./prisma.config.ts
COPY apps/backend/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000

CMD ["sh", "./entrypoint.sh"]