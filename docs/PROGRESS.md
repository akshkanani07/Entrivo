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


Visitor core, invitations, approvals, security, rooms.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P2-01** | Visitor types CRUD: name, color, icon, requiresApproval, requiresNda, requiresEscort, defaultDurationMinutes, isActive; seeded types protected; flags enforced in invitation/walk-in/kiosk/check-in | [ ] | | |
| **P2-02** | Invitation lifecycle: PATCH reschedule and DELETE/POST cancel (with reason); EMPLOYEE self-only; validation matrix; InvitationEvent history table; QR revoked/reissued + notifications; UI actions & timeline | [ ] | | |
| **P2-03** | Approval workflow engine: ApprovalRule model, multi-step sequential approvals, walk-in WAITING_APPROVAL, timeouts/escalation, OOO delegation, /approvals UI & Settings rule builder | [ ] | | |
| **P2-04** | QR passes (QRCode model): token hash, slot window (validFrom/validUntil), maxUses, usedCount, revocation, full 256-bit HMAC, rate limiting, pass public page without PII | [ ] | | |
| **P2-05** | Camera QR scanner component: BarcodeDetector with jsqr fallback, camera switch, torch, permission help, manual fallback, scan debounce | [ ] | | |
| **P2-06** | Check-in/out completion: verify details step, ID verification flow (masked number + sha256 + private storage + verified flag), exit confirmation, auto-checkout worker | [ ] | | |
| **P2-07** | Central scheduler (src/services/scheduler): recurring jobs for reminders, overstay, auto-checkout, doc expiry, reports; BullMQ + in-process fallback + /api/cron/*; Admin Jobs panel | [ ] | | |
| **P2-08** | Badges: BadgeTemplate CRUD UI, field toggles, orientation, size CR80/A6, live preview, exact print CSS, digital badge page | [ ] | | |
| **P2-09** | Host management: availability (AVAILABLE, BUSY, AWAY, OUT_OF_OFFICE + backup approver), meeting history per employee, "My visitors" self-service for EMPLOYEE | [ ] | | |
| **P2-10** | Security module completion: blacklist edit/remove/expiry, Watchlist (security+host alerts, approval gate), unified E.164 match logic, security notes & incident logs | [ ] | | |
| **P2-11** | Meeting-room booking: RoomBooking model, overlap-safe transaction, capacity check, day/week grid, invitation linkage, cancel/reschedule sync | [ ] | | |
| **P2-12** | Employee management polish: CSV import with preview & error report, deactivate flow (session revocation + invitation reassignment), self profile & avatar upload | [ ] | | |

---

# Entrivo — Phase 3 Implementation Progress

Document management and NDA e-signature.

| Task ID | Description | Status | Date | Commit |
|---------|-------------|--------|------|--------|
| **P3-01** | Documents: multipart upload via storage adapter (ID_PROOF, NDA, AGREEMENT, OTHER), size & magic-byte validation, antivirus hook interface (clearly labelled no-op driver), authorized signed URL downloads, expiry tracking & computed status (VALID, EXPIRING, EXPIRED) with 30/7/1 day DOCUMENT_EXPIRING alerts, soft delete, audited actions, visitor documents tab & /documents admin view with filters | [ ] | | |
| **P3-02** | NDA e-signature: org NDA template (versioned rich text with placeholders), digital signature pad integration on kiosk & staff tablet, PDF generation (pdfkit) with visitor, timestamp, device/IP, template version & SHA-256 hash stored as Document, repeat visitor NDA reuse (policy-controlled), requireNda policy blocking check-in | [ ] | | |
| **P3-03** | Move photos and signatures out of base64-in-database into storage: idempotent migration script for existing rows, resize & EXIF strip (sharp), badge/kiosk/walk-in flows updated to store file IDs/signed URLs only | [ ] | | |

