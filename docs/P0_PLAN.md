# Entrivo P0 Security Hardening & Architecture Plan

## 1. Overview & Objectives
Entrivo is an enterprise workplace visitor management platform. This plan details the surgical remediation of P0 security vulnerabilities across Authentication, Role-Based Access Control (RBAC), Multi-Tenant Scoping, Credential Management, and Edge/Route Security.

## 2. Phase A Architecture & Implementation Strategy

### A1. Google Sign-In Hardening
- **Client**: Mount Google Identity Services (`accounts.google.com/gsi/client`) on `/login` and `/register`. Only render when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is present and valid (not mock/empty).
- **Server (`/api/auth/google`)**:
  - Accept `{ credential }` (Google ID token). If client ID is unconfigured or mock, respond `501 Not Implemented`.
  - Validate with `OAuth2Client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })`.
  - Extract email, check `email_verified === true`, normalize to lowercase.
  - Search `prisma.user` for active, non-deleted user with matching email.
  - Reject unknown users with explicit 401 error message ("No Entrivo account is linked to this Google email..."). Never auto-create into random tenant.
  - Extract client IP (`x-forwarded-for` first hop / socket remote address) and user agent.
  - Create session and audit log `GOOGLE_OAUTH_LOGIN`.

### A2. Magic Link Hardening
- **Request (`/api/auth/magic-link`)**: Rate limit by IP (3 / 15 min) and by email (3 / 15 min). Always return uniform 200 `{ success: true, message: "If an account exists, a sign-in link was sent" }`. Never return token or URL in response.
- **Token Generation**: 32 cryptographically secure random bytes, SHA-256 hashed at rest, 15 min TTL, single use. Previous active tokens for that email invalidated upon issue.
- **Email Dispatch**: Send link pointing to `/magic-link/confirm?token=...`. Print link to server console only in non-production mock email mode.
- **Scanner Pre-fetch Protection**:
  - `GET /api/auth/magic-link` or `/magic-link/confirm` displays interactive "Continue to Entrivo" confirmation page.
  - Explicit user button POSTs token to `/api/auth/magic-link/consume` to consume token, create database session with real IP/UA, and log `MAGIC_LINK_LOGIN`.

### A3. RBAC Framework (`src/lib/rbac.ts`)
- **Permissions**: Granular union of actions (`dashboard.view`, `visitors.read`, `visitors.write`, `visitors.delete`, `invitations.create`, `invitations.read.all`, `invitations.read.own`, `walkin.create`, `checkin.perform`, `checkout.perform`, `qr.verify`, `approvals.act`, `blacklist.read`, `blacklist.manage`, `securityLogs.read`, `employees.read`, `employees.manage`, `org.manage`, `settings.manage`, `integrations.manage`, `templates.manage`, `audit.read`, `documents.read`, `documents.manage`, `meetingRooms.read`, `meetingRooms.manage`, `reports.view`, `reports.export`, `sessions.self`, `notifications.self`).
- **Role Mappings**: `ROLE_PERMISSIONS` dictionary mapping `SUPER_ADMIN`, `ORG_ADMIN`, `RECEPTIONIST`, `SECURITY_GUARD`, and `EMPLOYEE`.
- **Enforcement Helpers**: `requireUser()`, `requirePermission(perm)`, `requireAnyPermission(perms)`, `can(user, perm)`, `requirePagePermission(perm)`.
- **Privilege Escalation Protection**: Prevent self-role modification; only `SUPER_ADMIN` can assign `SUPER_ADMIN`; ensure organization retains at least 1 active `ORG_ADMIN`.
- **UI & Route Gateways**: Protect dashboard layout and navigation; create `/forbidden` page; wrap every API route.

### A4. Tenant Isolation (`src/lib/tenant.ts`)
- **Scoping**: `requireOrg(user)` strictly returns `organizationId` or throws `403 Forbidden`. No tenant handler may query without `organizationId`.
- **Mutation & Query Audit**: Every `findFirst`, `findMany`, `updateMany`, `deleteMany` must filter by `organizationId` or via tenant-bound relations (e.g., visitor -> organizationId).
- **Approvals**: Scoped by org; non-admins can only approve invitations where `approverId === employeeId`; execute status transition in single `prisma.$transaction`.
- **Integrations & QR Pass**: Allow-list integration keys; mask secrets in responses; lookup public pass strictly by `qrToken`.

### A5. Default Password Elimination & Password Lifecycle
- Remove `admin123` across API, seeds, UI, and docs.
- Employee creation: Assign random unusable password hash, set `mustChangePassword = true`, dispatch invite email with 48h set-password token (`PasswordResetToken` with purpose `"INVITE"`).
- Password validation: Minimum 10 characters, mixed case, numbers, blacklist check against common passwords, rejection of email local part.
- Mandatory password change: Server layout checks `mustChangePassword` and redirects to `/change-password`.

### A6. Forgot / Reset Password Flow
- `POST /api/auth/forgot-password`: Rate limited, uniform 200 response, 30 min TTL, branded email dispatch.
- `POST /api/auth/reset-password`: Validates token, updates hash, revokes all active sessions, writes `PASSWORD_RESET` audit log.
- Pages: Real `/forgot-password` submission and polished `/reset-password` UI.
- Middleware: Segment/exact matching for public routes and cron secret protection.

### A7. Small Hardening Bundle
- Rate limiting by IP and email on `/api/auth/login`; constant-time dummy bcrypt compare when user does not exist.
- Remove hard-coded secrets from `src/lib/qr.ts`.
- Cron protection via `CRON_SECRET` Bearer header with constant-time comparison.
- Security headers in `next.config.ts` (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP Report-Only).

---

## 3. Allowed Dependencies Justification
- `google-auth-library`: Required for server-side ID token verification using Google's public certs (`OAuth2Client.verifyIdToken`).
- `web-push` & `@types/web-push`: Required for RFC 8291/8292 VAPID web push payloads.

---

## 4. Phase A Manual Test Checklist
1. [ ] **Google Sign-In**: Post spoofed email to `/api/auth/google` -> verify 400/401; verify valid GIS ID token signs in existing user only.
2. [ ] **Magic Link**: Request link for existing and non-existing emails -> identical 200 response without URL; pre-fetch link -> token intact; confirm page POST -> token consumed and session established.
3. [ ] **RBAC**: Call `POST /api/employees` and `PUT /api/organization` as `EMPLOYEE` -> verify 403 Forbidden.
4. [ ] **Tenant Isolation**: Run `scripts/verify-tenant-isolation.ts` -> cross-tenant reads/writes return 404/403.
5. [ ] **Default Passwords**: Grep codebase for `admin123` -> 0 occurrences outside changelog; verify employee invite flow.
6. [ ] **Password Reset**: Complete forgot -> email link -> reset flow -> sessions revoked.
7. [ ] **Cron Security**: Call `/api/cron/auto-checkout` without Bearer secret -> 401 Unauthorized.
