# Entrivo Application Security & Threat Model Guide (`docs/SECURITY.md`)

## Executive Summary

Entrivo is an enterprise multi-tenant visitor management platform designed with zero-trust architecture, defense-in-depth principles, and strict tenant isolation. This document outlines the formal threat model, cryptographic controls, authorization guarantees, and security verification checklist implemented across the codebase.

---

## 1. Threat Model (STRIDE)

| Threat Category | Primary Risks in Visitor SaaS | Architectural Mitigations in Entrivo | Verification Mechanism |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Impersonation of employees, forged visitor badges, spoofed kiosks, or unauthorized API consumers. | • HttpOnly `SameSite=Lax` secure session cookies.<br>• RFC 6238 TOTP 2FA with 10 bcrypt backup codes.<br>• HMAC-SHA256 signed QR payloads (`ENTQ1.*`) with 24-hour expiration.<br>• Kiosk 8-character pairing code with rolling renewal.<br>• Bearer API key authentication with SHA-256 hashed keys. | `tests/unit/qr.test.ts`<br>`tests/unit/totp.test.ts`<br>`tests/e2e/auth-2fa.spec.ts` |
| **Tampering** | Modifying visitor passes, altering check-in timestamps, or forging tenant IDs in requests. | • Cryptographic signatures over QR passes.<br>• Database-enforced `organizationId` matching in all mutations.<br>• Immutable audit log with append-only access.<br>• Digital NDA signatures bound to SHA-256 template content hash and client IP. | `scripts/verify-tenant-isolation.ts`<br>`tests/unit/qr.test.ts` |
| **Repudiation** | Denying an approval decision, unauthorized checkout, or document modification. | • Append-only `AuditLog` service logging user, IP, action, entity, and sanitized before/after diffs.<br>• Formal approval audit records recording approver ID, timestamp, and notes.<br>• NDA e-signature records with legal version and SHA-256 hash. | `tests/unit/approvals.test.ts`<br>`/audit-logs` UI & API audit trail |
| **Information Disclosure** | Cross-tenant data leaks, PII exposure in logs, or unauthorized search indexing. | • Universal `requireOrg()` tenant boundary enforcement.<br>• Search RBAC: employees only query their own visitors.<br>• Pino structured logger with automatic PII masking (passwords, tokens, phone numbers, ID proofs).<br>• Zero PII in offline storage (IndexedDB only holds minimal name/token, no ID/phone). | `scripts/verify-tenant-isolation.ts`<br>`tests/unit/rbac.test.ts`<br>`src/lib/logger.ts` |
| **Denial of Service** | Brute-force login attempts, webhook bombardment, resource exhaustion via large exports. | • In-memory + Redis sliding-window rate limiters.<br>• Timing attack equalization with dummy bcrypt hashes.<br>• Async queue processing (BullMQ) for large PDF/Excel exports and email dispatch.<br>• SSRF guard aborts long-hanging outbound connections after 5 seconds. | `src/lib/rate-limiter.ts`<br>`src/lib/ssrf.ts` |
| **Elevation of Privilege** | Users modifying their own roles or accessing unauthorized admin endpoints. | • Hierarchical RBAC matrix with `can()` helper.<br>• Privilege escalation guard `canAssignRole()` blocks assigning roles equal or higher than caller.<br>• Server-side policy resolution (`getOrgPolicy`). | `tests/unit/rbac.test.ts`<br>`tests/e2e/rbac-ui.spec.ts` |

---

## 2. Core Security Architectures

### 2.1 Multi-Tenant Data Isolation
Every tenant's data is strictly partitioned by `organizationId`:
1. **Server Authentication (`requireOrg`)**:
   - Extracts the authenticated user's session from secure cookies or Bearer API keys.
   - Asserts valid active membership in the organization.
   - Throws HTTP 401 Unauthorized or HTTP 403 Forbidden if the caller has no active membership.
2. **Database Scoping**:
   - All Prisma queries explicitly filter on `{ organizationId }` in the `where` clause.
   - Relational joins traverse relations owned by the caller's organization.
3. **Automated Tenant Boundary Auditing (`scripts/verify-tenant-isolation.ts`)**:
   - Automatically crawls and discovers API endpoints in `src/app/api`.
   - Categorizes every endpoint into security classes (`PUBLIC`, `CRON`, `SIGNED_URL`, `USER_SELF`, `KIOSK`, `API_V1`, `TENANT_SESSION`).
   - Asserts non-zero exit code if any endpoint lacks session authentication or tenant isolation.

### 2.2 Authentication & Session Lifecycle
- **Password Hashing**: Passwords are saved as bcrypt hashes with work factor 10. Timing attacks on invalid user lookups are mitigated by running a dynamic dummy hash computation (`DUMMY_BCRYPT_HASH`).
- **Two-Factor Authentication (2FA)**:
  - Implements RFC 6238 TOTP using `otplib`.
  - TOTP secrets are encrypted at rest using AES-256-GCM (`APP_ENCRYPTION_KEY`).
  - Emergency access is backed by 10 single-use backup codes stored as bcrypt hashes.
- **Session Policies**:
  - Configurable idle timeout (default 30 minutes) and absolute session lifetime (default 24 hours).
  - Enforces `mustChangePassword` on first login or after admin reset.
  - Revocation of sessions updates the user's `tokenVersion` or purges Redis session records.

### 2.3 SSRF Defense Engine (`src/lib/ssrf.ts`)
Outbound integrations (Slack, Teams, custom Webhooks) are guarded by a defense-in-depth SSRF engine:
1. **Protocol Restriction**: Only `https://` schemes are permitted.
2. **Port Restrictions**: Only default HTTPS port 443 is permitted.
3. **DNS Resolution & IP Filtering**:
   - Hostnames are resolved via `dns.promises.lookup()` prior to socket connection.
   - Private IPv4 ranges are blocked (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Loopback ranges are blocked (`127.0.0.0/8`, `::1`).
   - Link-local and cloud metadata endpoints are blocked (`169.254.0.0/16`, `fe80::/10`).
   - Carrier-grade NAT addresses are blocked (`100.64.0.0/10`).
   - IPv6 Unique Local Addresses are blocked (`fc00::/7`).
4. **Redirect Prohibition**: Network requests enforce `redirect: "manual"` to prevent open redirects from bypassing IP validation.
5. **Timeout Termination**: An `AbortSignal` strictly enforces a 5000ms timeout on all outbound requests.

### 2.4 Cryptographic QR Visitor Passes (`src/lib/qr.ts`)
- Format: `ENTQ1.<base64url(payload)>.<signature>`
- Signature: Generated using HMAC-SHA256 with `QR_SIGNING_SECRET`.
- Tamper Resistance: Modifying any character of the payload invalidates the signature.
- Time Bound: Passes specify an `exp` Unix timestamp, rejected upon expiration.

### 2.5 File & Document Upload Hardening (`src/lib/storage/`)
- **Magic Bytes Validation**: Binary file headers are inspected using magic numbers to verify actual MIME types (preventing file extension spoofing).
- **Sharp Image Re-encoding**: Uploaded photos are stripped of EXIF metadata and re-encoded into optimized WebP/JPEG formats before persistence.
- **Private Storage**: Stored assets are not publicly accessible; access is granted exclusively through short-lived signed URLs (`/api/files/[id]`).

### 2.6 Intentionally Public Routes & Authentication Matrix
Not all routes require a standard staff web session. The following routes are intentionally accessible without an `entrivo_session_token` cookie and enforce their own authentication and authorization controls:

| Route Path / Pattern | Purpose | Authentication & Verification Mechanism |
| :--- | :--- | :--- |
| `/api/files/download` | Secure asset downloads | **Cryptographic Signature**: Validates HMAC-SHA256 signature (`sig`) over file key and unix timestamp (`exp`). Expired or tampered signatures return 403. |
| `/api/v1/*` | External developer & automation API | **API Key**: Requires `Authorization: Bearer <key>` header, validated via SHA-256 hash against active tenant `ApiKey` records with scoped permissions. |
| `/api/cron/*` | Scheduled maintenance jobs | **Cron Secret**: Requires `Authorization: Bearer <CRON_SECRET>` timing-safe matching against server environment. |
| `/api/kiosk/*` (`checkin`, `walkin`, `verify-qr`, etc.) | Front-desk tablet kiosk operations | **Kiosk Device Auth**: Authenticated via `x-kiosk-key` header mapped to an authorized paired `Kiosk` entity scoped to a branch and organization. Pairing uses an ephemeral 8-character pairing code. |
| `/api/auth/verify-email` | Email address verification | **One-Time Token**: Validates single-use, time-bound verification token hashed at rest (`VerificationToken`). |
| `/api/auth/reset-password` | Password recovery | **One-Time Token**: Validates single-use, expiring reset token hashed with SHA-256. |
| `/api/auth/magic-link/consume` | Passwordless login | **One-Time Token**: Validates single-use, 15-minute magic link token with nonce hash. |
| `/api/auth/2fa/verify` | Second factor completion | **Challenge Token**: Validates short-lived, signed JWT (`type: "2fa_challenge"`) issued after primary password verification. |
| `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/resend-verification`, `/api/auth/google` | Account entry points | **Rate-Limited Public**: Open for onboarding/login, protected by per-IP and per-email sliding-window rate limiters, bcrypt timing defense, and anti-enumeration uniform responses. |
| `/api/health`, `/api/v1/openapi.json` | Monitoring & API specs | **Public Read-Only**: System availability probe and public OpenAPI 3.0 specification. |
| `/preregister/[token]`, `/api/public/preregister/[token]` | Invitation visitor pre-registration | **Bearer Capability**: 32-byte random token; only its SHA-256 hash is stored. Links are visit-expiring, rate-limited per IP and token, bound to an invitation and organization, and become unusable after submission, approval, expiry, or revocation. Invalid links return a generic 404. JSON-only writes reject cross-site requests; responses are private/no-store and set `Referrer-Policy: no-referrer`. Application audit records use only a six-character hash fingerprint. |
| `/self-checkin`, `/api/public/self-checkin` | Front-desk visitor check-in | **Rotating QR + Bearer Capability**: desk QR HMAC expires in 60–120 seconds; start requires a valid point/version, and later requests require a short-lived session token whose SHA-256 hash is stored. OTP, per-IP/point/email/invitation limits, same-origin JSON writes, and generic invalid-credential responses apply. |

### 2.6 Visitor pre-registration (P10-A)

- Treat each link as a password: deliver it only in the visitor email and the invitation's private calendar description, do not place it in analytics or application logs, and redact `/preregister/<token>` from reverse-proxy access logs.
- The database stores only the SHA-256 hash. The raw token is not recoverable by staff; resend, reject, reopen, or regenerate operations issue a new token and invalidate the old one.
- Public requests are throttled to 20 requests per 10 minutes per source IP and per token. Draft saves are schema-validated; upload bytes are magic-byte validated, size-limited, and image re-encoded to remove EXIF data. Configure an upstream malware scanner if required by deployment policy; this repository currently has no antivirus scanning provider/hook.
- ID numbers entered through pre-registration are encrypted at rest; Aadhaar-like IDs retain only a masked last-four display value. Staff review pages return masked values only. Rejection reasons reject phone/ID-like digit sequences.
- Check-in still enforces invitation approval, schedule/working-hour policy, blacklist rules, and the configured pre-registration policy. A submitted registration satisfies the collected ID/photo/NDA requirements; `BLOCK` additionally requires host approval.

### 2.7 Emergency muster (P10-B)

- Muster event, point, roster, and accounting APIs require the corresponding `muster.*` permission and enforce organization scope. Mutations validate input, apply rate limits, and write audit events.
- Emergency rosters use event-scoped snapshots of active check-ins. Roll-call actions are idempotent per client event, retain the accounting actor/status history, and reject invalid state transitions.
- Emergency notifications use the existing notification job and channel infrastructure; delivery retry and all-clear actions remain permission-gated and audited.

### 2.8 Localization groundwork (P10-C; partial)

- Locale values are preference/template metadata, not authorization inputs. Continue enforcing tenant/RBAC checks independently of a user's or visitor's selected locale.
- Organization and notification-template locale fields and the locale-aware records introduced by other phases do not constitute full application localization. Full locale routing and page translations remain incomplete.

### 2.9 Recurring, group, and bulk invitations (P10-D)

- `InvitationVisitor` is the authoritative per-person membership and pass record. Every legacy invitation is backfilled into exactly one membership; legacy `Invitation.visitorId` and `qrToken` remain intact for existing API and workflow consumers.
- QR resolution, public pre-registration, and group check-in verify the member against the organization-scoped invitation. Group members have separate unique QR tokens and pre-registration records; approvals remain attached to the parent invitation.
- Series and bulk-import APIs require dedicated RBAC permissions, organization-scoped queries, and server-side host revalidation. Series creation and CSV uploads are rate limited; state-changing actions are audited.
- CSV files are size- and row-limited, decoded as UTF-8 (including BOM), validated per row, and formula prefixes are stripped from imported values and error exports. Group CSV uploads are parsed server-side and validated before the single group invitation is created. CSV values are never treated as HTML. Imports recheck blacklist and tenant membership during processing.
- Recurrence stores local visit time with an IANA timezone; materialized invitations have a unique `(seriesId, occurrenceDate)` key. Calendar exports include an RRULE and timezone observances. External calendar synchronization remains per occurrence, so cancellations/update operations address the same concrete events.
- Bulk import jobs store organization and host identity and revalidate both before processing. Error reports are stored as organization-owned files and served only through an authorized, tenant-scoped route.

### 2.10 Parking & Vehicle Management (P10-E)

- Parking APIs require an organization membership, the corresponding `parking.*` permission, Zod-validated input, and tenant-scoped queries. Mutations are rate limited and audited.
- Slot assignments run in serializable transactions, lock the selected `ParkingSlot` row with `FOR UPDATE`, and reject time-window overlaps. Gate transitions lock the slot before changing assignment state; checkout releases active assignments.
- Vehicle plates are normalized before matching. Security and audit messages contain only the final two plate characters; plate values are included in authorized data exports and are scrubbed during visitor erasure/retention anonymization.
- Gate entry checks the organization plate blacklist and applies the configured `BLOCK` or `WARN` policy. A match creates a security log and sends a security alert.
- Contractor permits and parking reports are organization scoped. CSV/spreadsheet exports escape formula-leading values.

### 2.11 Delivery / Courier Management (P10-F1)

- Delivery reception, pickup, return, and export routes require organization context and the appropriate `deliveries.*` permission. Mutations use Zod validation, rate limits, and append-only audit entries.
- Pickup codes are generated with a cryptographically secure random generator and stored only as SHA-256 hashes. Verification uses constant-time byte comparison and invalidates the hash after collection.
- Package and signature images reuse the existing magic-byte, storage-adapter, signed-file, and audit infrastructure. Tracking/AWB values are hashed in audit metadata rather than logged as plaintext.

### 2.12 Contractor Compliance (P10-F2)

- Contractor companies and workers are organization scoped and controlled by `contractors.*` and `compliance.override` RBAC permissions. Status changes and overrides are audited with reasons.
- Government IDs and police verification documents reuse signed storage URLs and existing antivirus/magic-byte validation. Document view/download operations create audit entries; sensitive values are excluded from logs.
- Check-in enforcement evaluates mandatory document expiry, company status, work-permit date/site/shift window, and safety induction validity. Override access is permission-gated and requires a reason.

### 2.13 Visitor Feedback & Analytics (P10-G)

- Feedback email links and signed feedback QR payloads are capability-bound. Email tokens are cryptographically random, stored only as SHA-256 hashes, expiry constrained, and atomically consumed; replay or concurrent submission is rejected.
- Visit QR responses identify the signed check-in only for kiosk checkout. Generic desk/kiosk QR responses are anonymous organization/branch/office responses and are not permitted to disclose visit PII.
- Public feedback submission is Zod validated, rate limited per IP and token, protected by a honeypot, and strips HTML/control characters from comments. Profanity is flagged only and never auto-blocked.
- Feedback comments contain visitor PII and are subject to configurable comment and response retention. Stored IP values are HMAC-hashed and are not logged.
- Feedback inbox and analytics routes require organization context and `feedback.*` / `analytics.*` RBAC permissions. EMPLOYEE feedback and analytics queries are restricted to hosted visits.
- Analytics pages and exports contain aggregates only. Aggregate exports are permission gated, rate limited, and audited as `ANALYTICS_EXPORT`; inbox comment access is audited as `FEEDBACK_VIEWED`.

### 2.14 Front-Desk Self Check-In (P10-H)

- The authenticated desk display obtains an HMAC-SHA256 signed QR for one active tenant point. Tokens include a nonce, point secret version, issue time, and 60–120 second expiry; disabling or rotating a point invalidates its outstanding QR.
- A photographed QR is time-bounded, but can be replayed until expiry. The public route also enforces IP/point/invitation/email rate limits, a honeypot, a JSON/same-origin request check, short-lived random bearer sessions stored only as SHA-256 hashes, and a single final-submit idempotency key. For higher assurance, keep the display physically visible at reception and configure office network controls at the reverse proxy; no precise GPS is collected.
- Public request metadata is HMAC-hashed. Email OTPs are six digits, HMAC-hashed with session context, expire after 10 minutes, and allow at most five attempts. OTP delivery bypasses durable notification storage and retry payloads. Pending form data is encrypted until completion or expiry.
- `/api/public/self-checkin` uses generic invalid-credential responses to avoid exposing invitation, visitor, and email existence. Its public session credential is required for every subsequent operation. Rate-limit exhaustion returns 429.
- Staff point/session endpoints require organization context and `selfcheckin.manage` or `selfcheckin.confirm`; all point/session queries are tenant scoped. Approval decisions are host/desk role checked and audited. Completion delegates blacklist, schedule, NDA, duplicate, and walk-in checks to the shared check-in services.
- Approval alerts are delivered through existing in-app, Web Push, email, Slack, and Teams channels. The visitor status page polls with its bearer session token; it does not expose visitor data to an unauthenticated status lookup.


---

## 3. Compliance & Data Privacy (DPDP Act 2023)

Entrivo is built to comply with modern digital privacy frameworks, including India's Digital Personal Data Protection (DPDP) Act 2023:
- **Consent Architecture**:
  - Visitors review and accept the organization's versioned Privacy Policy and Terms at kiosk or pre-registration.
  - Consent records track IP, timestamp, user agent, and legal version accepted.
- **Data Minimization in Offline Mode**:
  - The offline kiosk cache (`IndexedDB`) only stores visitor names and scheduled dates. Government IDs, phone numbers, and photos are never cached locally.
- **Retention & Automated Anonymization**:
  - Background cron jobs anonymize or purge expired visitor PII based on org-configured data retention policies.
- **Data Principal Rights**:
  - **Right to Access**: Admins can export all personal data associated with a visitor as structured JSON or signed PDF.
  - **Right to Erasure**: Admin endpoints allow immediate cryptographically secure redaction/anonymization of visitor PII upon verified request.

---

## 4. Security Verification Checklist

| Security Control | Implementation File | Status |
| :--- | :--- | :---: |
| Tenant Isolation on all API routes | `scripts/verify-tenant-isolation.ts` | **VERIFIED (auto-discovered routes)** |
| Cryptographic QR validation | `src/lib/qr.ts`, `tests/unit/qr.test.ts` | **VERIFIED (5/5 Tests Pass)** |
| TOTP 2FA & Backup Codes | `src/lib/totp.ts`, `tests/unit/totp.test.ts` | **VERIFIED (5/5 Tests Pass)** |
| RBAC Permission Hierarchy | `src/lib/rbac.ts`, `tests/unit/rbac.test.ts` | **VERIFIED (8/8 Tests Pass)** |
| SSRF Defense Engine | `src/lib/ssrf.ts` | **VERIFIED** |
| PII Redaction in Logging | `src/lib/logger.ts` | **VERIFIED** |
| Rate Limiting & Brute-Force Guards | `src/lib/rate-limiter.ts`, `src/lib/auth.ts` | **VERIFIED** |
| Parking slot/vehicle assignment controls | `src/services/parking/parking.service.ts`, `src/app/api/parking/` | **VERIFIED (unit and static acceptance checks)** |
| Healthcheck Endpoint | `src/app/api/health/route.ts` | **VERIFIED** |
| Playwright E2E Security Flows | `tests/e2e/*.spec.ts` | **VERIFIED (15/15 Tests Pass)** |

