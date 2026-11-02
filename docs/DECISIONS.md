# Entrivo Architecture & Security Decisions Log

## Decision 1: Google Identity Services (GIS) Token Verification
- **Context**: The existing endpoint `/api/auth/google` accepted raw email in the JSON body with zero cryptographic proof, allowing trivial account takeover.
- **Decision**: Implemented Google Identity Services client integration sending Google ID token (`credential`). Server verifies the signature, issuer, and audience against `GOOGLE_CLIENT_ID` via `OAuth2Client.verifyIdToken`. If credentials are not configured or are set to `"mock_*"`, the endpoint returns HTTP 501 and the client disables/hides the button.

## Decision 2: Magic Link Two-Phase Flow to Mitigate Email Scanners
- **Context**: Enterprise email security appliances (e.g. Mimecast, Proofpoint, Microsoft Defender) pre-fetch and scan links inside incoming emails. If GET immediately consumes the token, users find the link already expired.
- **Decision**: Split the magic link flow. `GET /api/auth/magic-link?token=...` redirects to an interactive landing page `/magic-link/confirm?token=...`. Only an explicit user action (button click) sends a `POST /api/auth/magic-link/consume` which consumes the token and issues the session cookie.

## Decision 3: Centralized Permission Matrix & Route-Level Guarding
- **Context**: Authorization was completely absent in route handlers, allowing any authenticated user (including Employee role) to perform administrative operations.
- **Decision**: Created `src/lib/rbac.ts` with explicit `Permission` definitions and mapped them to `UserRole`. Implemented `requirePermission` and `requireUser` which return standardized `{ success: false, error: "..." }` responses with HTTP 401 or 403.

## Decision 4: Strict Multi-Tenant Enforcement via `requireOrg`
- **Context**: Numerous API endpoints relied solely on `{ where: { id } }` or `{ organizationId: user.organizationId ? user.organizationId : {} }`, which breached tenant isolation if a user had a null organization.
- **Decision**: Created `src/lib/tenant.ts` with `requireOrg(user)`. All tenant routes require non-null `organizationId` unless explicitly designated for platform `SUPER_ADMIN`. Every mutation and query is scoped either directly by `organizationId` or through tenant relation chains.

## Decision 5: Set-Password Token & Deprecation of Hard-Coded Defaults
- **Context**: New employees and seed scripts relied on the default password `admin123`.
- **Decision**: Added `mustChangePassword` and `passwordChangedAt` to `User`. Added `purpose` column to `PasswordResetToken` allowing its reuse for both `"RESET"` and `"INVITE"`. Seed scripts generate cryptographically strong random passwords or consume `SEED_ADMIN_PASSWORD`.

## Decision 6: Group 1 Hardening — Kiosk Authentication, Push Validation, Search RBAC, SSRF
- **Kiosk Model & Key Architecture**: Added `Kiosk` Prisma model (`organizationId`, `name`, `keyHash` SHA-256, `isActive`, `lastUsedAt`). Created `src/lib/kiosk-auth.ts` checking `x-kiosk-key` header with SHA-256 hash comparison, per-key rate limiting (20 req / 60s), and automatic PII stripping. Admin can create/revoke kiosks via `/api/kiosk` and `/api/kiosk/[id]`. The `/kiosk` page runs completely without staff credentials using `sessionStorage` pairing.
- **Shared Visitor Services**: Extracted business logic into `src/services/visitors/{checkin,walkin,verify-qr}.service.ts` so that staff routes and kiosk routes share identical business logic and zero duplication.
- **Push Endpoint Allow-List**: Validated endpoint protocol (`https:`), disallowed credentials and custom ports, and matched hosts against strict push service allow-list (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`). Enforced p256dh key length (86-90 base64url) and auth key length (22-24 chars). Capped subscriptions at 10 per user with FIFO eviction.
- **Search RBAC & PII Protection**: Gated `/api/search` results behind explicit entity permissions (`visitors.read`, `employees.read`, `invitations.read.all` or own-host filter for `EMPLOYEE`, `checkin.perform` for badges). Completely removed `qrToken` from search indexing and response payloads.
- **SSRF Hardening**: Replaced IP-based loopback checks with strict per-integration host allow-lists for Slack (`https://hooks.slack.com/services/`) and Microsoft Teams (`*.webhook.office.com`, `*.logic.azure.com`, `*.powerplatform.com`, `*.api.powerplatform.com`). At dispatch time, enforced `redirect: "manual"` and `AbortSignal.timeout(5000)`.
- **Line Ending Normalization**: Added `.gitattributes` (`* text=auto`) and LF normalization for source files to eliminate cross-platform CRLF noise on Windows.

## Decision 7: Group 2 Hardening — Timing Equalization, Hybrid Rate Limiting, Atomic Tokens, Consent Versioning, mustChangePassword, Approval Flow
- **Response Timing Equalization**: Converted email dispatches in `/api/auth/magic-link` and `/api/auth/forgot-password` to non-blocking fire-and-forget routines. Implemented randomized target floor delays (80ms + 0-40ms jitter) so network response times for registered and unregistered email addresses are statistically indistinguishable.
- **Hybrid Rate Limiter & Client IP Resolution**: Updated `src/lib/rate-limit.ts` to retain a synchronous high-performance interface while asynchronously mirroring counters to Redis (`rl:*`). Added 10,000-entry memory store ceiling with LRU eviction. Added `clearLoginEmailRateLimit(email)` triggered upon valid password authentication. In `src/lib/auth.ts`, `getClientIp` now only inspects `X-Forwarded-For` when `TRUST_PROXY=true` (selecting the rightmost untrusted hop), falling back to loopback address when running untrusted.
- **Dynamic Dummy Hash**: Module initialization in `/api/auth/login` generates `bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12)` dynamically, eliminating hard-coded sample hashes.
- **Serializable Check-In & Organization Timezone**: Check-in operations evaluate date boundaries against the organization's configured IANA timezone (`Organization.timezone` default `Asia/Kolkata`). Checks for active sessions and check-in creation execute within a `Serializable` transaction with 3-attempt conflict retry and raw SQL partial unique index creation (`WHERE status='CHECKED_IN'`).
- **Atomic Single-Use Token Consumption**: Replaced two-step `findUnique` + `update` with atomic `updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })` checking `count === 1`. In `/api/auth/reset-password`, successfully resetting a password simultaneously invalidates any outstanding `MagicLinkTokens` for that account.
- **Legal Version & Consent Enforcment**: Added `src/lib/legal.ts` exporting `LEGAL_VERSION = "v1.0"`. Successful logins across all auth handlers set `termsAcceptedAt` and `termsVersion` if unpopulated. Dashboard layout verifies `termsVersion === LEGAL_VERSION`, redirecting non-compliant sessions to `/accept-terms`. Completed consent triggers `POST /api/auth/accept-terms` and logs `TERMS_ACCEPTED` in the tenant audit log.
- **Strict API `mustChangePassword` Guarding**: `requireUser()` rejects callers possessing `mustChangePassword === true` with HTTP 403 `{ code: "PASSWORD_CHANGE_REQUIRED" }`, exempting only `/api/auth/change-password`, `/api/auth/logout`, and `/api/auth/me`.
- **Approval Workflow Minimum**: Invitations specifying a visitor type with `requiresApproval = true` or names referencing VIP, Vendor, or Contractor auto-transition to `status: "PENDING"`, instantiate a corresponding `Approval` record assigned to the host, and dispatch `APPROVAL_REQUESTED` notifications.

## Decision 8: Group 3 Hardening — HTML Escaping, Next.js Production Headers, Tenant Test Suite, Line-Endings
- **HTML Escaping in Transactional Emails**: Implemented `escapeHtml()` helper in `src/services/email/email.templates.ts` applied to all interpolated visitor, host, company, badge, and URL fields across all email templates.
- **Production URL Fallbacks**: Created `src/lib/app-url.ts` with `getAppUrl()`. Replaced all `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"` fallbacks across auth, invitations, employees, and notifications routes. Throws a hard configuration error in production if `NEXT_PUBLIC_APP_URL` is omitted.
- **Next.js Production Security Headers**: Added `serverExternalPackages: ["bullmq", "ioredis"]` in `next.config.ts`. In production (`NODE_ENV === "production"`), stripped `'unsafe-eval'` from Content Security Policy and enabled `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (HSTS).
- **Comprehensive Multi-Tenant Isolation Suite**: Extended `scripts/verify-tenant-isolation.ts` to 16 automated assertions covering visitors, invitations, meeting rooms, approvals, webhooks, notification templates, employees, blacklist, security logs, CSV reports exports, and global search. Registered `pnpm test:tenant` in `package.json`.
- **Git Line-Ending Configuration Guidance**: Windows environments should set `git config core.autocrlf false` (or `input`) when collaborating on this repository. The project enforces LF line endings via repository-level `.gitattributes`.

## Decision 9: Kiosk Mode One-Time Hardware Pairing Architecture
- **Context**: The initial kiosk implementation used a raw secret key stored in browser `sessionStorage`, requiring manual key entry per session.
- **Decision**: Refactored kiosk authentication to a secure one-time hardware pairing flow:
  1. **Kiosk Model**: Updated `Kiosk` schema with `{ id, organizationId, name, deviceTokenHash (sha256), pairingCodeHash, pairingExpiresAt, lastUsedAt, expiresAt, isActive, createdById }`.
  2. **One-Time 8-Digit Pairing Code**: An administrator (`kiosks.manage` or `settings.manage`) generates an 8-digit numeric pairing code (10-minute TTL, single-use, rate-limited, stored as sha256). The raw code is presented to the admin ONCE.
  3. **Pairing Endpoint (`POST /api/kiosk/pair`)**: Validates the pairing code against `pairingCodeHash`, generates a 32-byte crypto random device token, stores only its SHA-256 hash in `deviceTokenHash`, clears the pairing code, and issues an `httpOnly + Secure(prod) + SameSite=Strict` cookie `kiosk_token` with `maxAge: 180 days`. Tokens are NEVER stored in localStorage or sessionStorage.
  4. **Rolling Renewal**: Every successful request to `/api/kiosk/*` automatically extends `expiresAt` (+180 days) and refreshes the `kiosk_token` cookie via `renewKioskCookie`.
  5. **Kiosk Authentication (`requireKiosk`)**: Reads the `kiosk_token` cookie (with fallback support), verifies `deviceTokenHash` using constant-time comparison (`timingSafeEqual`), checks `isActive` and `expiresAt`, enforces per-device rate limiting (30 req / 60 s), scopes queries strictly to the kiosk's organization, and strips all visitor PII.
  6. **Kiosk UI Experience**: The `/kiosk` page checks the cookie on the server component; if missing or invalid, it redirects to `/kiosk/pair`. The `/kiosk/pair` screen allows staff to enter the 8-digit code once. Admin UI in `Settings > Lobby Kiosks` allows registering new kiosks, generating re-pairing codes, and instant revocation.

## Decision 11: Universal Zod Input Resilience & Safe Navigation Across All Endpoints
- **Context**: Form submissions (e.g. Walk-in Visitor registration, Invitations, Kiosk) caused `Expected string, received null` when optional fields were submitted with `null` or `""`, because schemas defined `z.string().min(...)` or `z.string().optional()` without handling nulls. In addition, unhandled relation navigations caused runtime crashes such as `Cannot read properties of undefined (reading 'badgeNumber')`.
- **Decision**:
  1. Created `src/lib/zod-helpers.ts` exporting `requiredString`, `optionalString`, `optionalNullableString`, `requiredEmail`, and `optionalEmail`. These pre-processors normalize `null`, `undefined`, and empty strings before validation, ensuring custom, human-readable error messages and correct TypeScript types without Zod throwing `Expected string, received null`.
  2. Applied these helpers across all API routes (`/api/visitors/walkin`, `/api/kiosk/walkin`, `/api/invitations`, `/api/employees`, `/api/visitors`, `/api/meeting-rooms`, `/api/auth/*`, `/api/organization/*`, `/api/documents`, `/api/security/*`).
  3. Made `OrgPolicySchema` completely resilient to nulls and invalid settings values, and updated `getOrgPolicy()` in `src/lib/settings-registry.ts` to use `OrgPolicySchema.safeParse()` with fallback to `DefaultOrgPolicy`.
  4. Added safe navigation (`?.`) and fallback defaults across all components (`WalkinForm`, `KioskClientView`, `CheckinTerminalClient`, `BadgeCard`, `/badge/[id]`, `/reports`, `/visitors`, `/dashboard`), preventing `Cannot read properties of undefined` errors.

## Decision 12: Phase 3 Document Management, NDA E-Signature & Base64 Migration
- **Context**: Visitors required NDA agreements and ID proof storage, but photos and signatures were stored as huge base64 strings directly inside database rows. In addition, uploaded files lacked binary magic-byte detection and virus scanning hooks.
- **Decision**:
  1. **Magic-Byte Validation & Antivirus**: Implemented `validateAndProcessUpload` in `src/services/storage/validation.ts`. Verifies binary magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF....WEBP`, PDF `%PDF-`). Rejects renamed executables (DOS MZ header) and oversize files. Integrated `AntivirusScanner` pluggable interface with clean dev No-Op scanner.
  2. **Signed NDA PDF Generation & Fingerprint**: Used `pdfkit` to generate tamper-evident PDF binaries embedding visitor identity, organization, timestamp, IP, device, and signature. Computes SHA-256 binary hash stored on the `Document` record.
  3. **Repeat Visitor NDA Policy Reuse**: Implemented `getVisitorValidNda(visitorId, orgId)` inspecting unexpired, non-deleted NDA documents. When `policy.ndaReuseEnabled` is active, repeat visitors bypass re-signing. If `policy.requireNda` is active, check-in without a valid signed NDA is rejected with HTTP 400.
  4. **Document Expiry Lifecycle**: Added `status` (`VALID`, `EXPIRING`, `EXPIRED`) with automated alert dispatcher (`DOCUMENT_EXPIRING` event at 30, 7, 1 days). Protected cron endpoint `/api/cron/document-expiry` via Bearer token.
  5. **Base64-to-Storage Migration**: Created `scripts/migrate-base64-to-storage.ts` that strips EXIF metadata, resizes photos/signatures via `sharp`, persists to storage adapter, updates `Visitor.avatarUrl` and `CheckIn.photoUrl` / `signatureUrl` to clean file URLs, and verifies idempotency (0 items on re-run).
  6. **UI Enhancements**: Updated `/documents` with multipart file upload (`FormData`), status filter pills, file size/SHA-256 fingerprint inspect modal, and added a dedicated "Documents" tab inside visitor inspect profiles (`VisitorsClientList`).

## Decision 13: Phase 4 Multi-Channel Notifications, Branded Email Catalog & Delivery Platform
- **Context**: The application required multi-channel notifications (Email, In-App, Web Push, Slack, Teams) across 16 lifecycle events, custom templating with approval workflows, user quiet hours, calendar invitations (.ics), and delivery reliability tracking. WhatsApp was permanently decommissioned.
- **Decision**:
  1. **Expanded Event Bus & Unified Routing**: Expanded `NotificationEvent` with 10 new lifecycle triggers (`INVITATION_CANCELLED`, `INVITATION_RESCHEDULED`, `VISITOR_WAITING`, `VISITOR_OVERSTAYED`, `VISITOR_REMINDER`, `APPROVAL_ESCALATED`, `DOCUMENT_EXPIRING`, `DAILY_REPORT`, `CHECKIN_CONFIRMATION`, `CHECKOUT_THANKS`). Centralized all dispatches through `notify()` in `src/services/notifications/dispatcher.ts` with multi-recipient resolution (visitor, host, backup approver, receptionists, guards, org admins).
  2. **Multi-Lingual Template Governance**: Built `src/services/notifications/template-engine.ts` with allow-listed variables (`ALLOWED_TEMPLATE_VARIABLES`), multi-lingual built-in defaults for English (`en`), Hindi (`hi`), and Gujarati (`gu`), and a formal approval workflow: `DRAFT` -> `PENDING_APPROVAL` -> `ACTIVE` with admin audit logging. Active custom templates supersede defaults, while drafts fall back safely.
  3. **User Quiet Hours & Security Critical Bypass**: Added `quietHoursEnabled`, `quietHoursStart`, and `quietHoursEnd` to `User`. The dispatcher evaluates quiet hours against organization timezone, suppressing noisy external channels (email, push, chat) while maintaining in-app inbox delivery. Critical security alerts (`SECURITY_ALERT`, `PASSWORD_RESET`, `MAGIC_LINK`, `TWO_FACTOR_CHALLENGE`, `EMPLOYEE_INVITED`) automatically bypass quiet hours and user-disabled preferences.
  4. **Standard Calendar (.ics) Generator**: Implemented RFC 5545 standard `generateIcs` in `src/services/email/ics.ts` generating `VCALENDAR`/`VEVENT` with `METHOD:REQUEST`, `UID`, `SUMMARY`, `DTSTART`, `DTEND`, `ORGANIZER`, and `ATTENDEE`. Attached as base64 calendar invites in Mailjet v3.1 transactional emails for invitations and reschedules.
  5. **Delivery Log & Dead-Letter Queue**: Added delivery tracking fields (`recipient`, `retryCount`, `lastAttemptAt`, `deliveredAt`, `isDeadLetter`) to `Notification`. Created `/api/notifications/delivery-log` with 24-hour channel metrics, granular filtering, and manual retry. Failed messages exceeding 3 attempts transition automatically to `isDeadLetter: true`.
  6. **Daily Summary Aggregates & Background Reminders**: Implemented `/api/cron/daily-report` compiling real database aggregates (check-ins, active visitors, overstays, pending approvals) into digest reports. Implemented `/api/cron/reminders` dispatching 24h and 1h reminders before scheduled visits.
  7. **Provider-Agnostic SMS Adapter**: Defined `SmsProviderAdapter` interface with a `NoopSmsAdapter` implementation that reports unconfigured status and refuses fake sends. Updated `/integrations` UI to clearly present Enterprise SMS Gateway as "Coming soon".

## Decision 14: Phase 5 — Dashboard Real Telemetry, Reports Engine with Formula Protection, Global Search Palette, and Audit Log Append-Only Architecture
- **Dashboard Telemetry (`P5-01`)**:
  - Removed every hardcoded chart array and mock number from `page.tsx` and chart components. Strict grep verification asserts zero `Math.random` across all dashboard and report modules.
  - Implemented 6 real metric cards (`todayVisitors`, `checkedInNow`, `pendingApprovals`, `upcomingNext3h`, `overstaying`, `checkedOutToday`) and 6 real chart aggregations (`dailyVisitors` 7/30 days, `byDepartment`, `visitorTypeMix`, `purposeAnalysis`, `hourlyFootfall` 00-23h, `topHosts`).
  - Implemented dynamic branch filtering, date-range presets ("today", "7d", "30d", "custom"), auto-refresh (30s interval with live indicator), and role-specific scoping (EMPLOYEE role is restricted strictly to visits they host).
  - Backed by an in-memory cache with 20-second TTL keyed by organization, role, branch, and date range.
- **Reports Engine & Multi-Format Exports (`P5-02`)**:
  - Built `/api/reports` and `/api/reports/export` with granular filters (branch, department, visitor type, host, status, purpose, search) and real-time KPI computations (total visits, completed, active, average dwell duration, overstay rate).
  - Export formats:
    - **CSV**: Streaming CSV output with formula injection neutralization (cells beginning with `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed with `'`).
    - **Excel**: Multi-sheet formatted workbook via `exceljs` featuring an "Executive Summary" sheet and a styled "Visitor Records" sheet with brand header fills and auto-fitted columns.
    - **PDF**: Branded vector PDF via `pdfkit` featuring header branding, metadata, KPI summary boxes, and tabular visitor log.
  - Audit logging: Every export automatically logs `REPORT_EXPORT` with the format and record count.
  - Saved & Scheduled Reports: Extended the `Report` model to persist report parameters, recurrence crons (`scheduleCron`), and recipient distribution lists.
- **Global Search & Omnisearch Command Palette (`P5-03`)**:
  - Created `CommandPalette.tsx` with global `Ctrl+K` and `Cmd+K` keyboard shortcut detection, escape handling, and keyboard arrow navigation (`↑`, `↓`, `↵`).
  - Search engine `/api/search` supports visitor name, company, host employee name, normalized phone digits (`q.replace(/\D/g, '')`), and ISO/local date parsing.
  - Strict RBAC: visitors require `visitors.read`, employees require `employees.read`, invitations require `invitations.read.all` or own-host filtering for `EMPLOYEE`, active badges require `checkin.perform`. Never exposes sensitive tokens or visitor PII.
  - Recent searches are stored in and managed via `localStorage` with clear history functionality.
- **Audit Log Append-Only Architecture (`P5-04`)**:
  - Created `src/services/audit/audit.service.ts` with a uniform `audit()` helper and automated diff engine (`computeDiff(before, after)`) that redacts passwords and secrets.
  - Wired audit events across authentication (login success/failure, logout), visitors (create, update with diff, delete), invitations (create, cancel, reschedule), approvals (approve, escalate, reject), check-in/checkout, organization settings changes (with before/after diff), employee role changes, kiosk pairing/revocation, document uploads/downloads/deletions, integrations, and report/audit exports.
  - Strict append-only enforcement: `/api/audit` returns HTTP 405 Method Not Allowed for `POST`, `PUT`, `PATCH`, and `DELETE` requests.
  - UI at `/audit-logs` provides real-time search, filters (action, entity, date range), pagination, structured diff viewer drawer, and injection-protected CSV export.

## Decision 17: PWA, Service Worker v2, and Offline Check-in Capabilities (Phase 7)
- **PWA Manifest & Install Prompts (`P7-01`)**:
  - Configured standard PWA web manifest (`/manifest.json`) with `standalone` display mode, theme `#4f46e5`, background `#080c14`, maskable icons (192x192, 512x512), screenshots (desktop wide 1280x720 and mobile narrow 750x1334), and quick shortcuts (`/checkin`, `/invitations/new`, `/security`).
  - Implemented `PwaInstallPrompt` with native `beforeinstallprompt` support, 7-day dismissal suppression in `localStorage`, and an interactive 3-step iOS Safari "Add to Home Screen" modal guidance flow.
- **Service Worker v2 & Strict PII Isolation (`P7-02`)**:
  - Versioned static cache (`entrivo-static-v3`) precaches immutable app shell assets (`/offline.html`, `/manifest.json`, static icons).
  - **Strict PII Protection**: Never caches `/api/*` endpoints, non-GET HTTP methods, or dynamic server HTML containing visitor PII.
  - Offline navigations gracefully fall back to the self-contained `/offline.html` page.
  - Supports `SKIP_WAITING` for live updates and background sync for `sync-offline-checkins`.
- **Offline Check-in Queue & IndexedDB Storage (`P7-03`)**:
  - Created `src/lib/offline-db.ts` managing `entrivo_offline_db` with `offline_queue` and `expected_visitors`.
  - **Zero PII Constraint**: Cached expected visitor directory stores strictly minimal operational fields (`visitorName`, `company`, `hostName`, `scheduledDate`, `startTime`, `qrToken`, `status`) and never stores phone numbers, email addresses, or government ID numbers.
  - Complete wipe via `clearOfflineStorage()` called on user logout, idle session timeout, and kiosk hardware revocation.
- **Idempotency Engine & Server Wins Conflict Resolution (`P7-03`)**:
  - Implemented `src/lib/idempotency.ts` with in-memory LRU and Redis mirroring (`idemp:*`, 24-hour TTL).
  - Server endpoints (`/api/visitors/checkin`, `/api/visitors/checkout`, `/api/visitors/walkin`, `/api/kiosk/checkin`, `/api/kiosk/walkin`) check `Idempotency-Key` headers to ensure safe retries.
  - Replayed synchronization requests encountering `HTTP 409 Conflict` or state collision cleanly drop from the local queue under the "Server Wins" strategy.
- **Responsive Mobile Navigation & Camera UX (`P7-04`)**:
  - Created `DashboardShell.tsx` with mobile drawer navigation, hamburger menu trigger, and touch backdrop.
  - Main container enforces `overflow-x-hidden min-w-0` to prevent horizontal blowouts on viewports down to 360px.
  - `QRScannerModal` provides live camera scanning with Chromium `BarcodeDetector` support, explicit camera permission error handling (`NotAllowedError`, `NotFoundError`), and seamless manual token fallbacks.








