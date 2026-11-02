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

Notifications and email completion (WhatsApp stays permanently removed).

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



