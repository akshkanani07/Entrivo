# Docker Testing Checklist (`docs/docker-todo.md`)

This checklist enumerates validation procedures to execute on a host machine with Docker and Docker Compose installed:

## 1. Image Build & Composition
- [ ] **Multi-stage Image Build**:
  ```bash
  docker compose build --no-cache
  ```
  Verify that the builder installs dependencies, generates Prisma client, and completes `next build` without warnings or failures.

- [ ] **Service Startup**:
  ```bash
  docker compose up -d
  ```
  Verify that PostgreSQL, Redis, `entrivo-app`, and `entrivo-worker` start cleanly.

## 2. Automated Migration & Initialization
- [ ] **Database Migration Execution**:
  Inspect `entrivo-app` startup logs to ensure `docker-entrypoint.sh` runs `prisma migrate deploy` before `next start`:
  ```bash
  docker compose logs app | grep "Applying production Prisma migrations"
  ```
- [ ] **Verify Database Connection**:
  Check that migrations table `_prisma_migrations` is applied cleanly in Postgres.

## 3. Container Healthchecks
- [ ] **Web Application Healthcheck**:
  ```bash
  docker compose ps app
  ```
  Verify container status transitions from `starting` to `healthy` (HTTP 200 on `http://localhost:3000/api/health`).

- [ ] **Worker Process Heartbeat Healthcheck**:
  ```bash
  docker compose ps worker
  ```
  Verify container status transitions from `starting` to `healthy`. Verify heartbeat file `/tmp/worker-heartbeat` is touched every 15s.

## 4. Asynchronous Queue Processing
- [ ] **Job Ingestion & Processing**:
  Trigger a test notification or webhook delivery from the application and monitor worker logs:
  ```bash
  docker compose logs -f worker
  ```
  Ensure jobs are picked up from `notification-jobs`, `webhook-jobs`, and `calendar-sync` queues without crashing.

- [ ] **Graceful Shutdown**:
  ```bash
  docker compose stop worker
  ```
  Verify `Shutdown signal received. Closing worker threads...` and all BullMQ workers close cleanly on `SIGTERM`.
