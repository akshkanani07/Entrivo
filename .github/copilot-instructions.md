# Entrivo project rules

Entrivo is an existing enterprise visitor management platform: Next.js 15 App Router, TypeScript, Prisma 6 + PostgreSQL, BullMQ/Redis, Mailjet, Web Push, Slack/Teams. Do NOT rewrite the project. Extend it and follow existing patterns.

- Validate every input with zod (src/lib/zod-helpers.ts).
- Enforce tenant isolation on every query (src/lib/tenant.ts).
- Check RBAC on every route (src/lib/rbac.ts).
- Write AuditLog entries and apply rate limiting (src/lib/rate-limit.ts) on new routes.
- Send notifications through src/services/notifications (dispatcher + channels).
- Every email uses the shared layout in src/services/email/email.templates.ts.
- Every schema change needs a Prisma migration (UTF-8, no BOM). Use pnpm.
- Never log secrets, tokens or phone numbers. Never commit .env.
- Windows PowerShell commands only. Show the complete updated file for each change.
- Work on one phase at a time, then stop and wait for "next".