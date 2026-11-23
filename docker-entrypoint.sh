#!/bin/sh
set -e

# Asynchronous Background Worker execution
if [ "$1" = "worker" ] || [ "$1" = "pnpm" -a "$2" = "worker" ]; then
  echo "[Entrypoint] Starting Entrivo Background Worker..."
  exec ./node_modules/.bin/tsx -r ./scripts/mock-server-only.cjs scripts/worker.ts
fi

# Next.js Web App execution: deploy database migrations first
echo "[Entrypoint] Applying production Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "$1" = "app" ] || [ "$1" = "start" ] || [ -z "$1" ]; then
  echo "[Entrypoint] Starting Entrivo Next.js Server..."
  exec ./node_modules/.bin/next start
fi

exec "$@"
