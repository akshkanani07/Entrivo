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
