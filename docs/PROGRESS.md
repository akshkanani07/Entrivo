# Entrivo — Phase 0 Implementation Progress

Tracking checklist for Phase 0 review findings closure.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P0-01** | Kiosk mode: one-time pairing, 8-digit code, httpOnly cookie auth, rolling renewal, no storage in JS-readable places, shared service logic, staff session isolation | [x] | 2026-11-01 | `42dfe53` |
| **P0-02** | Push subscribe: HTTPS validation, host allow-list, key lengths, 10 subs cap per user | [x] | 2026-10-31 | `0f44009` |
| **P0-03** | Search RBAC: per-entity permissions, EMPLOYEE restriction, zero visitor PII or qrToken leak | [x] | 2026-10-31 | `0f44009` |
| **P0-04** | Webhook/Integration SSRF: strict per-integration host allow-list (Slack, Teams), https only, redirect manual, 5s timeout, masked URLs | [x] | 2026-10-31 | `0f44009` |
| **P0-05** | Timing equalization: non-blocking email dispatch + randomized floor delay in magic-link and forgot-password | [x] | 2026-10-31 | `400efb4` |
| **P0-06** | Rate limiter: in-memory + Redis mirroring, clear on login, LRU eviction; getClientIp with TRUST_PROXY | [x] | 2026-10-31 | `400efb4` |
| **P0-07** | Dummy bcrypt hash: dynamic generation at module init via bcrypt.hashSync | [x] | 2026-10-31 | `400efb4` |
| **P0-08** | Check-in integrity: Serializable transaction, timezone-aware date boundaries, blacklist check | [x] | 2026-10-31 | `400efb4` |
| **P0-09** | Atomic one-time token consumption: updateMany count === 1 for magic link, reset password, invalidate magic links on reset | [x] | 2026-10-31 | `400efb4` |
| **P0-10** | Consent & legal versioning: LEGAL_VERSION export, /accept-terms gating; remove invented dpo@entrivo.com and GDPR claims, use CONTACT_EMAIL/GRIEVANCE_EMAIL and DPDP Act 2023 | [x] | 2026-11-01 | `1dc6733` |
| **P0-11** | mustChangePassword enforcement in API layer: requireUser() 403 PASSWORD_CHANGE_REQUIRED | [x] | 2026-10-31 | `400efb4` |
| **P0-12** | Email safety: escapeHtml helper, fix CSS typo (pt: -> padding-top:), NEXT_PUBLIC_APP_URL fallbacks | [x] | 2026-11-01 | `1dc6733` |
| **P0-13** | next.config.ts: serverExternalPackages, production HSTS, CSP without unsafe-eval, import "server-only" guards | [x] | 2026-11-01 | `1dc6733` |
| **P0-14** | Repo hygiene: .gitattributes, update .gitignore (.env*, .uploads/, tsbuildinfo), update .env.example | [x] | 2026-11-01 | `1dc6733` |
| **P0-15** | Approval workflow: minimum trigger in place, full configurable workflow engine handled in P2-04 | [x] | 2026-10-31 | `400efb4` |
