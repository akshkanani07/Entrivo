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


