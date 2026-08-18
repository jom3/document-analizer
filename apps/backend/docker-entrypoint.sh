#!/bin/sh
set -e

echo "Aplicando migraciones de Prisma..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Arrancando el backend..."
exec node dist/src/main.js