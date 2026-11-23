# Entrivo — Enterprise Workplace Visitor Management System

Entrivo is a modern, enterprise-grade, multi-tenant visitor management platform built with Next.js 15 App Router, TypeScript (strict mode), Prisma 6, PostgreSQL, Redis, and BullMQ. Designed for security-critical enterprise campuses, corporate headquarters, and high-security facilities, Entrivo provides end-to-end management of visitor lifecycles, digital NDA execution, touchless check-ins, meeting room bookings, and automated compliance.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Clients["Clients & Terminals"]
        Web["Web Dashboard (Desktop / Mobile)"]
        Kiosk["Self-Service Reception Kiosk (PWA)"]
        External["Third-Party Webhook Consumers / Public API v1"]
    end

    subgraph Edge["Security & Ingress"]
        Middleware["Next.js Middleware (RBAC / Auth / Session)"]
        RateLimit["Rate Limiter (Sliding Window in Redis / Memory)"]
        SSRF["SSRF Defense Guard (DNS Filter / Private IP Blocker)"]
    end

    subgraph AppServer["Next.js App Router Server (Node.js 22)"]
        API["API Layer (/api/v1/*, /api/*)"]
        Pages["Server & Client Components"]
        AuthEng["Auth Engine (TOTP 2FA, JWT, Session)"]
        QREng["QR Pass Cryptographic Signer (HMAC-SHA256)"]
        ApprovalEng["Multi-Level Approval Engine"]
        StorageAdapter["Storage Adapter (Local / S3 / Cloudinary)"]
    end

    subgraph Background["Async Processing & Queues"]
        Worker["BullMQ Worker Process"]
        Queue["BullMQ Job Queues (Emails, Webhooks, Calendar Sync)"]
    end

    subgraph Persistence["Storage & Databases"]
        Postgres[("PostgreSQL 16 (Prisma ORM)")]
        Redis[("Redis 7 (Sessions, Cache, Rate Limits)")]
        DiskStorage[("Encrypted Local Disk / Object Store")]
    end

    subgraph ExternalServices["External Providers"]
        Mailjet["Transactional Email (Mailjet v3.1)"]
        Calendars["Google Calendar & Microsoft Outlook"]
        Chat["Slack & Microsoft Teams Notifications"]
    end

    Clients --> Edge
    Edge --> AppServer
    AppServer --> Postgres
    AppServer --> Redis
    AppServer --> StorageAdapter
    StorageAdapter --> DiskStorage
    AppServer --> Queue
    Queue --> Worker
    Worker --> Postgres
    Worker --> Redis
    Worker --> Mailjet
    Worker --> Calendars
    Worker --> Chat
    Worker --> SSRF
    SSRF --> External
```

---

## Key Features

- **Multi-Tenant SaaS Foundation**: Strict logical partition on `organizationId` across all data queries and mutations, auto-discovered and verified across 108 API endpoints.
- **Enterprise Authentication & 2FA**: HttpOnly session cookies, RFC 6238 TOTP two-factor authentication, 10 single-use bcrypt backup codes, absolute & idle session timeouts.
- **Cryptographic Visitor Passes**: Dynamic QR passes signed via HMAC-SHA256 (`ENTQ1.*`), tamper-evident, and bound to 24-hour expiration windows.
- **Touchless Kiosk & PWA**: Standalone installable PWA terminal, 8-character pairing codes, camera QR scanner, and offline IndexedDB check-in queue with server-wins conflict resolution.
- **Digital NDA Execution**: Configurable rich-text templates, digital signature pad, SHA-256 content hashing, and on-the-fly PDF generation (`pdfkit`).
- **Granular RBAC**: Strict role permissions (`SUPER_ADMIN`, `ORG_ADMIN`, `BRANCH_MANAGER`, `SECURITY_OFFICER`, `RECEPTIONIST`, `EMPLOYEE`, `KIOSK`) with privilege escalation guards.
- **Enterprise Integrations**: Outbound HMAC-signed webhooks with exponential retries, Google & Outlook two-way calendar sync, Slack/Teams event routing, and REST API v1 with scoped API keys.
- **DPDP Act 2023 Compliance**: Data retention auto-purging, visitor consent tracking, and self-service data principal access and erasure tooling.

---

## Local Development (Windows 11 Setup)

### Prerequisites
- **Node.js**: v22.12.0 LTS or higher
- **Package Manager**: `pnpm` v9.15.0 or higher
- **Database**: PostgreSQL 16+ running locally on port 5432
- **Cache/Queue**: Redis 7+ running locally on port 6379 (native Windows or WSL2)

### Step 1: Install Dependencies
Open PowerShell or Command Prompt in the repository root:
```powershell
pnpm install
```

### Step 2: Environment Configuration
Copy the template configuration file:
```powershell
copy .env.example .env
```
Ensure your database and secrets are configured in `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/entrivo"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="generate-a-random-32-character-secret-key"
QR_SIGNING_SECRET="generate-another-random-32-char-key"
CRON_SECRET="generate-a-secure-cron-bearer-token"
APP_ENCRYPTION_KEY="32-byte-base64-encoded-master-key"
```
*(For a complete line-by-line guide of all 36 environment variables, see [`docs/ENV.md`](file:///c:/Entrivo/docs/ENV.md))*

### Step 3: Database Migration & Realistic Seed
Deploy the Prisma schema and run the idempotent database seed:
```powershell
pnpm prisma migrate deploy
pnpm prisma:seed
```
*The seed creates realistic demo organizations (Acme Global), branches, departments, employees across all roles, active visitor records, and approval workflows. Seed credentials are encrypted and outputted upon execution.*

### Step 4: Run Development Services
Start the Next.js development server:
```powershell
pnpm dev
```
In a separate terminal window, start the BullMQ background worker:
```powershell
pnpm worker:dev
```
Open [http://localhost:3000](http://localhost:3000) to access the Entrivo portal.

---

## Docker Quickstart

To spin up the entire Entrivo platform (Postgres, Redis, Next.js Web App, and BullMQ Background Worker) in Docker:

```bash
docker-compose up -d --build
```

Services will be accessible at:
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **Healthcheck**: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`

*(For detailed production deployment instructions, see [`docs/DEPLOYMENT.md`](file:///c:/Entrivo/docs/DEPLOYMENT.md))*

---

## Quality & Testing Suites

Entrivo includes comprehensive automated test suites covering unit logic, tenant isolation, and end-to-end browser flows:

### 1. Vitest Unit Test Suite
Runs all 36 unit tests covering RBAC permissions, tenant helpers, cryptographic QR signing, TOTP 2FA, notification templates, policy schemas, approval state machines, and timezone shifts:
```bash
pnpm test
```

### 2. Tenant Boundary Isolation Audit
Auto-discovers and audits all 108 API routes in `src/app/api`, verifying tenant isolation and access denial:
```bash
pnpm test:tenant
```

### 3. Playwright End-to-End Suite
Launches headless Chromium testing critical user journeys (login with 2FA, visitor check-in with QR pass, kiosk pairing, offline sync, RBAC navigation):
```bash
pnpm test:e2e
```

### 4. Full Quality Regression
Run TypeScript type-checking, production build, and security audits:
```bash
pnpm exec tsc --noEmit
pnpm build
pnpm audit
```

---

## Project Documentation Index

- [`docs/SECURITY.md`](file:///c:/Entrivo/docs/SECURITY.md): Threat model (STRIDE), SSRF guard, cryptographic signatures, and security checklist.
- [`docs/DEPLOYMENT.md`](file:///c:/Entrivo/docs/DEPLOYMENT.md): Production containerization, Vercel deployment, Windows Server service configuration, BullMQ worker, and crons.
- [`docs/ENV.md`](file:///c:/Entrivo/docs/ENV.md): Exhaustive 36-variable specification with defaults and production requirements.
- [`docs/SETTINGS_ENFORCEMENT.md`](file:///c:/Entrivo/docs/SETTINGS_ENFORCEMENT.md): Typed policies registry, validation rules, and enforcement mechanisms.
- [`docs/PROGRESS.md`](file:///c:/Entrivo/docs/PROGRESS.md): Detailed 10-phase development and compliance ledger.
- [`docs/DECISIONS.md`](file:///c:/Entrivo/docs/DECISIONS.md): Architectural decisions log from Phase 0 through Phase 9.

---

## License

Proprietary enterprise software. All rights reserved.

