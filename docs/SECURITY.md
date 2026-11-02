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
   - Automatically crawls and discovers all 108 API endpoints in `src/app/api`.
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
| Tenant Isolation on all API routes | `scripts/verify-tenant-isolation.ts` | **VERIFIED (108/108 Routes)** |
| Cryptographic QR validation | `src/lib/qr.ts`, `tests/unit/qr.test.ts` | **VERIFIED (5/5 Tests Pass)** |
| TOTP 2FA & Backup Codes | `src/lib/totp.ts`, `tests/unit/totp.test.ts` | **VERIFIED (5/5 Tests Pass)** |
| RBAC Permission Hierarchy | `src/lib/rbac.ts`, `tests/unit/rbac.test.ts` | **VERIFIED (8/8 Tests Pass)** |
| SSRF Defense Engine | `src/lib/ssrf.ts` | **VERIFIED** |
| PII Redaction in Logging | `src/lib/logger.ts` | **VERIFIED** |
| Rate Limiting & Brute-Force Guards | `src/lib/rate-limiter.ts`, `src/lib/auth.ts` | **VERIFIED** |
| Healthcheck Endpoint | `src/app/api/health/route.ts` | **VERIFIED** |
| Playwright E2E Security Flows | `tests/e2e/*.spec.ts` | **VERIFIED (15/15 Tests Pass)** |

