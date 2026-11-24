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

---

# Entrivo — Phase 1 Implementation Progress

Identity, storage foundation, organization structure, holidays, working hours, typed policies, and universal Zod input resilience.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P1-00** | Storage adapter (local, cloudinary, s3), File model, private download route /api/files/[id], upload API with magic bytes & sharp re-encode | [x] | 2026-11-01 | `c4159fb` |
| **P1-01** | Email verification: EmailVerificationToken, /verify-email, resend rate limit, register flow, requireVerifiedEmail policy | [x] | 2026-11-01 | `c4159fb` |
| **P1-02** | Two-Factor Auth (TOTP via otplib, RFC 6238): enrol, 10 backup codes, login challenge token, encrypted secret, audit | [x] | 2026-11-01 | `c4159fb` |
| **P1-03** | Password policy: min length, complexity, history (PasswordHistory last N), optional max age enforcement | [x] | 2026-11-01 | `c4159fb` |
| **P1-04** | Session policy: idle timeout + absolute lifetime server-side enforcement, client idle warning modal, revoke session | [x] | 2026-11-01 | `c4159fb` |
| **P1-05** | Organization profile: logo upload via storage adapter, brand color, timezone, locale, branding in login/badges/emails | [x] | 2026-11-01 | `c4159fb` |
| **P1-06** | Org structure CRUD: Branch, Office, Floor, Zone, Department with 409 reference blocking & audit logging | [x] | 2026-11-01 | `c4159fb` |
| **P1-07** | Holidays: CRUD per branch, date ranges, recurring yearly, CSV import, calendar view | [x] | 2026-11-01 | `c4159fb` |
| **P1-08** | Working hours: structured JSON per branch/office, timezone-aware enforcement (ALLOW, WARN, BLOCK) | [x] | 2026-11-01 | `c4159fb` |
| **P1-09** | Typed policies registry (src/lib/settings-schema.ts, zod) + getOrgPolicy(orgId) cached resolver | [x] | 2026-11-01 | `c4159fb` |

---

# Entrivo — Phase 3 Implementation Progress

Document management and NDA e-signature.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P3-01** | Documents: multipart upload via storage adapter (ID_PROOF, NDA, AGREEMENT, OTHER), size & magic-byte validation, antivirus hook interface, download via signed URLs, expiry date + computed status (VALID, EXPIRING, EXPIRED) with alerts at 30/7/1 days (DOCUMENT_EXPIRING event), soft delete, audit logging, documents tab on visitor profile & /documents admin view with filters | [x] | 2026-11-01 | `0ba7f55` |
| **P3-02** | NDA e-signature: org NDA template (NdaTemplate model, versioned rich text), signature pad on kiosk/staff, generate PDF (pdfkit) with visitor, timestamp, device/IP, template version, content hash, store as Document, reuse still-valid NDA for repeat visitors (policy ndaReuseEnabled), requireNda policy blocks check-in without valid signed NDA | [x] | 2026-11-01 | `0ba7f55` |
| **P3-03** | Move photos and signatures out of base64-in-database into storage: migration script (scripts/migrate-base64-to-storage.ts), resize & EXIF strip (sharp), badge/kiosk/walk-in flows updated to store file IDs/signed URLs only, API responses return clean file IDs or URLs | [x] | 2026-11-01 | `0ba7f55` |

---

# Entrivo — Phase 4 Implementation Progress

Notifications and email completion.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P4-01** | Events: add INVITATION_CANCELLED, INVITATION_RESCHEDULED, VISITOR_WAITING, VISITOR_OVERSTAYED, VISITOR_REMINDER (24h and 1h), APPROVAL_ESCALATED, DOCUMENT_EXPIRING, DAILY_REPORT, CHECKIN_CONFIRMATION, CHECKOUT_THANKS; wire each to real code paths | [x] | 2026-11-02 | `50c63a0` |
| **P4-02** | Routing + preferences: org default routing table; per-user preference matrix (event x channel) with quiet hours UI; security-critical messages bypass; delivery to host, backup approver, org admins, receptionists, guards, visitor | [x] | 2026-11-02 | `50c63a0` |
| **P4-03** | Template system: NotificationTemplate overrides per org/event/channel/locale (en, hi, gu) with allow-listed variables, workflow DRAFT -> PENDING_APPROVAL -> ACTIVE, versioning, live preview, test send, safe fallback, used by EVERY send | [x] | 2026-11-02 | `50c63a0` |
| **P4-04** | Email catalog: shared responsive branded layout, plain-text alt, unsubscribe for non-critical; visitor emails with .ics for invitations/reschedules; employee emails; admin emails | [x] | 2026-11-02 | `50c63a0` |
| **P4-05** | Delivery log: filters (event, channel, status, date), error text, retry, dead-letter view, 24h metrics per channel | [x] | 2026-11-02 | `50c63a0` |
| **P4-06** | Daily report and digests: job at org-configurable local time, content from real database aggregates | [x] | 2026-11-02 | `50c63a0` |
| **P4-07** | Slack/Teams per-event routing UI (which events go to which channel), message customization, last-delivery status | [x] | 2026-11-02 | `50c63a0` |
| **P4-08** | SMS: provider-agnostic adapter interface only; UI marks SMS as "Coming soon", no fake sending | [x] | 2026-11-02 | `50c63a0` |

---

# Entrivo — Phase 5 Implementation Progress

Dashboard, reports, search, audit.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P5-01** | Dashboard (real data only): cards — today's visitors, checked-in now, pending approvals, upcoming (next 3h), overstaying, checked-out today; charts — daily visitors (7/30 days), by department, purpose analysis, visitor-type mix, hourly footfall, top hosts; branch and date-range filters; role-specific views (EMPLOYEE sees only their visitors); auto-refresh; skeletons; aggregate queries with supporting indexes and a short cache. Delete every hard-coded/random number. | [x] | 2026-11-02 | `00c197e` |
| **P5-02** | Reports: Daily / Weekly / Monthly presets + custom range; filters — date, department, visitor type, host, branch, status, purpose; KPI summary; paginated table; exports: CSV (streaming, CSV-injection safe), Excel (exceljs, formatted, summary sheet), PDF (pdfkit, branded); large exports run as queue jobs and notify with a signed download link; saved reports and scheduled email reports using the Report model. Permissions reports.view / reports.export. | [x] | 2026-11-02 | `00c197e` |
| **P5-03** | Global search: Ctrl+K command palette; search visitor name, phone (normalized), company, host, date; per-entity permissions (from P0-03); recent items; keyboard navigation; debounced; indexed queries. | [x] | 2026-11-02 | `00c197e` |
| **P5-04** | Audit log: uniform `audit()` helper; coverage — login success/failure, logout, visitor create/update/delete, invitation create/cancel/reschedule, approvals, check-in, check-out, document upload/view/download/delete, settings changes with before/after diff, role changes, exports, kiosk pair/revoke, API key and webhook changes; UI with filters (user, action, entity, date), pagination, detail drawer (diff), CSV export; append-only (no update/delete endpoints). | [x] | 2026-11-02 | `00c197e` |

---

# Entrivo — Phase 6 Implementation Progress

Admin settings, compliance, data lifecycle.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P6-01** | Settings UI complete, tabs: General/Branding, Notifications, Visitor, Approval rules, Security, Integrations, Kiosks, Data & Privacy, Jobs. Every setting is typed in the zod registry, has defaults, validation, audit diff, and is ENFORCED. Produce docs/SETTINGS_ENFORCEMENT.md. | [x] | 2026-11-02 | `08226fa` |
| **P6-02** | Required fields: invitation, walk-in and kiosk forms render dynamically from the visitor/field settings and validate on the server. | [x] | 2026-11-02 | `08226fa` |
| **P6-03** | Data retention & DPDP tooling: retention job that anonymizes/purges visitor PII (photo, ID, signature, phone, email) after N days per org and data class; data-principal tools — export a visitor's data (JSON/PDF) and erase/anonymize on request, all audited; consent records view; versioned privacy notice shown at kiosk before capture. Privacy text must match real behavior. | [x] | 2026-11-02 | `08226fa` |

---

# Entrivo — Phase 7 Implementation Progress

PWA, Service Worker v2, and Offline Check-in Capabilities.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P7-01** | Installable PWA: complete manifest (shortcuts: Check-in, New invitation, Scan QR; screenshots, maskable icons), install-prompt UI, iOS "Add to Home Screen" guidance, theme/splash. | [x] | 2026-11-02 | `45dfdcd` |
| **P7-02** | Service worker v2: precache app shell, sensible runtime caching for static assets/images, offline fallback page, "new version available" update flow; NEVER cache API or authenticated HTML containing PII. | [x] | 2026-11-02 | `45dfdcd` |
| **P7-03** | Offline check-in: IndexedDB (idb) queue for check-in, check-out and walk-in when offline; local validation against a minimal cached list of today's expected visitors (no ID numbers/phones; cleared on logout and kiosk revoke); Idempotency-Key header so replays are safe; Background Sync plus manual "Sync now"; server wins on conflict; clear banner with pending count; kiosk offline mode. | [x] | 2026-11-02 | `45dfdcd` |
| **P7-04** | Mobile/responsive audit of EVERY page at 360px; camera/QR permission UX; Lighthouse PWA/accessibility evidence in the report. | [x] | 2026-11-02 | `45dfdcd` |

---

# Entrivo — Phase 8 Implementation Progress

Integrations and Public API.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P8-01** | Outbound webhook engine: versioned event catalog (visitor.invited, invitation.cancelled, invitation.rescheduled, visitor.checked_in, visitor.checked_out, approval.requested, approval.decided, security.alert, document.expiring); HMAC-SHA256 signature + timestamp headers with rotatable secret; BullMQ retries (exponential, max 8); delivery log UI with redelivery; auto-disable after repeated failures; SSRF guard (https only, resolve DNS and block private/loopback/link-local ranges at connect time, no redirects, 5s timeout); test ping. | [x] | 2026-11-02 | `8c4eee9` |
| **P8-02** | API keys: ApiKey model (hashed, visible prefix, scopes, expiry, lastUsed, per-key rate limit), management UI (secret shown once), Bearer auth for /api/v1/*, scopes mapped to RBAC permissions, strictly org-scoped. | [x] | 2026-11-02 | `8c4eee9` |
| **P8-03** | Public REST API v1: visitors, invitations (create/cancel/reschedule), check-ins (read), employees (read), webhook subscribe/unsubscribe (REST-hook style for Zapier/Make); pagination, idempotency keys, rate-limit headers, consistent errors; OpenAPI 3 document at /api/v1/openapi.json and a read-only /developers docs page including Zapier/Make recipes. | [x] | 2026-11-02 | `8c4eee9` |
| **P8-04** | Calendar integrations: Google Calendar and Microsoft Outlook OAuth per host (minimum scopes), encrypted token storage with refresh, create/update/delete a calendar event when an invitation is created/rescheduled/cancelled (visitor as attendee only if policy allows), failures retried via queue, connect/disconnect UI. Independently of OAuth, ALWAYS attach an .ics file to emails. | [x] | 2026-11-02 | `8c4eee9` |
| **P8-05** | Slack/Teams: connect to the P4-07 routing and P8-01 event catalog; "Open in Entrivo" deep links; delivery status in UI. | [x] | 2026-11-02 | `8c4eee9` |

---

# Entrivo — Phase 9 Implementation Progress

Quality, Performance, Docs.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P9-01** | Tests: vitest units (rbac, tenant helpers, policies, qr, totp, template rendering, approval engine, timezone logic); integration tests on a test database for critical flows; expand scripts/verify-tenant-isolation.ts to AUTO-DISCOVER every API route and assert cross-tenant and cross-role denial (exit non-zero on any leak); Playwright E2E: login (+2FA), invitation -> approval -> QR check-in -> checkout, kiosk pairing + self check-in, offline queue replay, RBAC UI hiding. Scripts: pnpm test, test:e2e, test:tenant. | [x] | 2026-11-02 | `ed8fa8c` |
| **P9-02** | Performance: review indexes for every org-scoped list and search, remove N+1 queries, cursor pagination everywhere, caching where safe, bundle audit (no server code in client bundles), image optimization. | [x] | 2026-11-02 | `ed8fa8c` |
| **P9-03** | Observability: pino structured logs with request ids and PII masking, /api/health (db, redis, queue), friendly error pages, optional Sentry via env. | [x] | 2026-11-02 | `ed8fa8c` |
| **P9-04** | Seed and docs: idempotent realistic demo seed (never default passwords); README (Windows setup, architecture diagram in mermaid); docs/ENV.md (every variable), docs/DEPLOYMENT.md (Vercel and Docker, worker and cron setup), docs/SECURITY.md (threat model + checklist), Dockerfile + docker-compose (postgres, redis, app, worker); complete .env.example. | [x] | 2026-11-02 | `ed8fa8c` |
| **P9-05** | Final regression: tsc, build, lint, all tests, pnpm audit; remove dead code; PROGRESS.md 100%; final report with evidence and the human-needed list. | [x] | 2026-11-02 | `ed8fa8c` |

---

# Entrivo — Phase 10 Implementation Progress

Visitor Pre-Registration Portal.

Status `PARTIAL` denotes implemented groundwork that does not cover the full phase scope. P10-B currently has muster APIs/services and unit tests but no dashboard UI or dedicated acceptance script. P10-C has locale metadata/template groundwork, not full application locale routing or page localization.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P10-A** | Invitation-linked public pre-registration with hashed expiring tokens, resumable mobile wizard, encrypted/minimized ID storage, validated photo and signature uploads, NDA reuse/signing, vehicle details, versioned consent, host review and link lifecycle, localized email/reminders, tenant-scoped RBAC, check-in BLOCK/WARN/OFF policy, and acceptance/security verification. | [x] | 2026-11-23 | — |
| **P10-B** | Emergency muster backend: tenant-scoped events and muster points, active-check-in roster snapshots, idempotent roll-call actions, notification delivery tracking, RBAC, rate limits, audit events, migration, and core/notification unit tests. No dashboard UI or dedicated acceptance script is present. | PARTIAL | 2026-11-24 | — |
| **P10-C** | Locale groundwork in organization/template/pre-registration/visitor records and multilingual notification templates. Full application locale routing and localized page coverage are not implemented. | PARTIAL | — | — |
| **P10-D** | Recurring invitation series and RRULE calendar export, group invitations with per-visitor passes and reception check-in, tenant-scoped CSV preview/import and error reports, visitor deduplication, vendor registry, migration backfill, RBAC/policy/docs, and focused recurrence/CSV/calendar tests. | [x] | 2026-11-23 | — |
| **P10-E** | Parking lots and typed slots, serializable reservation locking, vehicle plate validation/blacklist, check-in/checkout and gate state transitions, permits, availability/utilization reports, plate PII export/erase/retention, RBAC, tenant audit, migration, docs, and acceptance tests. | [x] | 2026-11-24 | — |
| **P10-F1** | Organization-scoped courier/delivery reception, hashed one-time pickup codes, collection/return/unclaimed lifecycle, 24h/72h reminders, lightweight delivery-person policy entry, notifications, CSV export, RBAC, audit, migration, docs, and acceptance tests. | [x] | 2026-11-23 | — |
| **P10-F2** | Contractor company/worker profiles, reusable contractor documents, compliance requirements and status computation, expiry notifications, work-permit and induction enforcement, suspend/block controls, override audit, RBAC, migration, docs, and acceptance tests. | [x] | 2026-11-23 | — |
| **P10-G1** | Visitor feedback and analytics foundation: feedback models/enums, visitor locale, host notification/meeting timestamps, manager relation, retention-ready response fields, supporting indexes, migration, typed settings, and RBAC permissions. | [x] | 2026-11-23 | — |
| **P10-G2** | Checkout feedback scheduling: delayed BullMQ feedback queue, checkout-thanks event integration, SHA-256 feedback tokens, locale-aware payload routing, one-tap NPS email links, kiosk/staff signed visit and generic QR helpers, and worker support. | [x] | 2026-11-23 | — |
| **P10-G3** | Public feedback submission: email/visit/generic QR pages, Zod and honeypot controls, comment sanitization and profanity flagging, IP/token limits, atomic one-use email consumption, visit-response uniqueness, privacy-hashed IP metadata, and detractor notification routing. | [x] | 2026-11-23 | — |
| **P10-G4** | Feedback inbox: tenant-scoped cursor pagination, date/score/host/branch/review filters, EMPLOYEE own-host restriction, reviewed state, sanitized internal notes, and feedback view/manage audit events. | [x] | 2026-11-23 | — |
| **P10-G5** | Analytics dashboard and reporting: P5-01 reuse, peak-hours heatmap, busy days, host load, wait/p90, no-show, duration/overstay, approval turnaround, NPS trend/split/themes, previous-period comparison, tenant/RBAC/employee scope, CSV/Excel export, short cache, and scheduled Report job support. | [x] | 2026-11-24 | — |
| **P10-G6** | Tests and acceptance: NPS, wait-time, no-show, token single-use concepts, checkout→feedback→detractor→analytics flow coverage, deterministic seeded heatmap totals, P10-G acceptance script, package script, and tenant auto-discovery extensions. | [x] | 2026-11-24 | — |
| **P10-G7** | Documentation and closeout: README feature/run guidance, environment settings, security threat model, RBAC matrix/routes, schema changes, analytics formulas, acceptance progress, and P10-G operational verification. | [x] | 2026-11-24 | — |
| **P10-H1** | Self-check-in point/session schema, versioned rotating QR, OTP/session security, tenant policy settings, audit events, rate limits, and RBAC. | [x] | 2026-11-24 | — |
| **P10-H2** | Mobile visitor flow with personal pass camera scan, Email OTP walk-in flow, live status polling, host/reception approval queue, notifications, expiry/escalation worker, and shared check-in service enforcement. | [x] | 2026-11-24 | — |
| **P10-H3** | Focused unit and mobile E2E tests, tenant/acceptance verification, migration checks, and README/ENV/settings/security/RBAC/schema/progress documentation. | [x] | 2026-11-24 | — |

---

# Entrivo — P11-U6 Implementation Progress

The P11-U6.1 implementation and unit/type/lint checks are complete. Browser execution remains pending: the local app cannot start with the current invalid `APP_ENCRYPTION_KEY`, and viewport tests require an authenticated context plus `E2E_VISITOR_ID`.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P11-U6.1** | Shared page header and visitor profile with responsive tabs, visit/invitation/document/vehicle/feedback/note/audit sections, VIP and blacklist management, duplicate merge, data export/erasure, tenant-scoped actions, migration, unit tests, and viewport-configurable Playwright coverage. | PARTIAL | 2026-11-24 | — |
| **P11-U6.2** | Invitation detail with lifecycle stepper, pass QR/link, pre-registration review, approval history, parking/group details, reminder history, activity timeline, edit/cancel/reschedule, pass resend, list-row links, tenant/RBAC/rate/audit controls, migration, unit tests, and responsive Playwright coverage. | PARTIAL | 2026-11-24 | — |

P11-U6.2 has static and unit-test coverage. Browser execution requires an authenticated Playwright context and `E2E_INVITATION_ID`; the local app configuration blocker recorded for P11-U6.1 is still unresolved.

---

# Entrivo — P11-U7a Walk-In Approval Closeout

The walk-in approval policy is enforced in the shared walk-in service. `REQUIRE_HOST` is the secure default; `AUTO_APPROVE` delegates entry to the standard check-in gates; `DESK_OVERRIDE` keeps host approval pending while allowing authorized reception/security staff to approve with a required reason. The override is audited and cannot bypass blacklist or compliance blocks. Pending walk-ins escalate to reception in-app and through Web Push after the organization-configured delay (10 minutes by default).

The authenticated Playwright setup now refuses databases unless `DATABASE_URL` is PostgreSQL and the database name includes `test` or `e2e`. After the guard, it applies migrations and seeds a deterministic organization and admin/receptionist/guard/employee accounts with random per-run passwords only in process environment variables. The 7a specs cover 390×844 mobile and 1440×900 desktop with axe critical-issue and browser-console checks.

Windows PowerShell command (first set `DATABASE_URL` to a dedicated, disposable PostgreSQL test database):
```powershell
$env:DATABASE_URL = 'postgresql://<user>:<password>@localhost:5432/entrivo_test'
$env:E2E = '1'
pnpm test:e2e:7a
```

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P11-U7a** | Responsive visitor, walk-in, reception and security workflows; organization-scoped approval policy, audited desk override, escalation, guarded authenticated E2E setup, unit coverage, and documentation. | PARTIAL: TYPE/UNIT/BUILD PASS; TENANT/E2E NOT ACCEPTED | 2026-11-24 | — |

Validation: `tsc --noEmit` passed; Vitest passed (36 files, 155 tests); `pnpm build` exited successfully from an env-isolated copy and emitted existing Edge Runtime/lint warnings. `pnpm lint` exited with 0 errors and 391 warnings. `pnpm test:tenant` detected the new override route as secure but failed on the existing `/api/locale` route. Playwright stopped at the database safety guard because no process-level `DATABASE_URL` was available. No Playwright pass is claimed; run the command above against the dedicated test database before accepting browser coverage.


