# Entrivo — Settings Registry & Policy Enforcement Matrix

This document provides an exhaustive, verified matrix of every setting exposed in the Entrivo administration console.
Every setting listed here is:
1. **Typed in the Zod registry** (`src/lib/settings-schema.ts`).
2. **Given secure, production-grade defaults**.
3. **Validated on the server** with appropriate ranges/types.
4. **Recorded in audit logs** with before/after state diffs on update (`src/services/audit/audit.service.ts`).
5. **Directly enforced in core business logic and APIs**. Any setting without verified enforcement is omitted from the UI.

---

## 1. Visitor Policies & Limits

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `allowWalkIn` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts` (`performWalkIn`), `src/app/kiosk/KioskClientView.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Walk-In Disabled) |
| `advanceBookingDays` | `z.number().min(1).max(90)` | `30` | `src/app/api/invitations/route.ts` (`POST`), `src/app/(dashboard)/invitations/new/NewInvitationForm.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Advance Booking Limit) |
| `maxVisitDurationHours` | `z.number().min(1).max(24)` | `8` | `src/app/api/cron/auto-checkout/route.ts` | `scripts/verify-phase-6-acceptance.cjs` (Test 3: Auto-Checkout Overstay) |
| `maxVisitorsPerHostPerDay` | `z.number().min(1).max(100)` | `20` | `src/services/visitors/walkin.service.ts` (`performWalkIn`) | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Daily Host Limit) |
| `blockedVisitorTypes` | `z.array(z.string())` | `[]` | `src/services/visitors/walkin.service.ts`, `src/app/api/invitations/route.ts` | Unit / Tenant Isolation Tests |

---

## 2. Dynamic Required Fields (P6-02)

These settings dynamically control form rendering on staff dashboards and self-service kiosks, while enforcing mandatory fields on the server:

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `requireCompany` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/app/api/invitations/route.ts`, `WalkinForm.tsx`, `KioskClientView.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Dynamic Required Fields) |
| `requireEmail` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/app/api/invitations/route.ts`, `WalkinForm.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Dynamic Required Fields) |
| `requirePhone` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/app/api/invitations/route.ts`, `WalkinForm.tsx`, `KioskClientView.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Dynamic Required Fields) |
| `requirePurpose` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/app/api/invitations/route.ts`, `WalkinForm.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Dynamic Required Fields) |
| `requireIdNumber` | `z.boolean()` | `false` | `src/services/visitors/walkin.service.ts`, `WalkinForm.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Dynamic Required Fields) |
| `requireHost` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/app/api/invitations/route.ts`, `WalkinForm.tsx`, `KioskClientView.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Dynamic Required Fields) |

---

## 3. Verification & Legal Policies

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `requirePhoto` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts` (`performWalkIn`), `WalkinForm.tsx`, `KioskClientView.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: Photo Requirement) |
| `requireIdProof` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts` (`performWalkIn`), `WalkinForm.tsx` | `scripts/verify-phase-6-acceptance.cjs` (Test 2: ID Proof Requirement) |
| `requireNda` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/services/documents/nda.service.ts` | `scripts/verify-phase-3-acceptance.cjs` & Acceptance Suite |
| `ndaReuseEnabled` | `z.boolean()` | `true` | `src/services/visitors/walkin.service.ts`, `src/services/documents/nda.service.ts` (`getVisitorValidNda`) | `scripts/verify-phase-3-acceptance.cjs` |
| `ndaValidityDays` | `z.number().min(1).max(730)` | `365` | `src/services/documents/nda.service.ts` (`getVisitorValidNda`) | `scripts/verify-phase-3-acceptance.cjs` |

---

## 4. Approval Rules & Scheduling

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `autoApprovalEnabled` | `z.boolean()` | `false` | `src/app/api/invitations/route.ts` (`POST`), `src/services/invitations/approval.service.ts` | Acceptance Suite |
| `approvalTimeoutMinutes` | `z.number().min(5).max(1440)` | `60` | `src/services/invitations/approval.service.ts` (`checkApprovalTimeouts`) | Acceptance Suite |
| `escalateToAdminOnTimeout` | `z.boolean()` | `true` | `src/services/invitations/approval.service.ts` (`checkApprovalTimeouts`) | Acceptance Suite |
| `workingHoursEnforcement` | `z.enum(["ALLOW", "WARN", "BLOCK"])` | `"WARN"` | `src/lib/settings-registry.ts` (`checkScheduleAndHolidayPolicy`), `src/services/visitors/walkin.service.ts` | `scripts/verify-phase-2-acceptance.cjs` |
| `holidayEnforcement` | `z.enum(["ALLOW", "WARN", "BLOCK"])` | `"WARN"` | `src/lib/settings-registry.ts` (`checkScheduleAndHolidayPolicy`), `src/services/visitors/walkin.service.ts` | `scripts/verify-phase-2-acceptance.cjs` |

---

## 5. Security Protocols & Password Policy

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `sessionIdleTimeoutMinutes` | `z.number().min(0).max(480)` | `30` | `src/lib/auth.ts` (session activity verification) | Security Middleware Test |
| `sessionAbsoluteLifetimeHours` | `z.number().min(1).max(168)` | `24` | `src/lib/auth.ts` (session absolute maxAge validation) | Security Middleware Test |
| `requireVerifiedEmail` | `z.boolean()` | `false` | `src/app/api/auth/login/route.ts` | Acceptance Suite |
| `maxLoginAttempts` | `z.number().min(3).max(10)` | `5` | `src/lib/auth-rate-limit.ts` (IP + username lockout) | Security Rate-Limit Test |
| `lockoutWindowMinutes` | `z.number().min(5).max(120)` | `15` | `src/lib/auth-rate-limit.ts` (lockout TTL) | Security Rate-Limit Test |
| `passwordMinLength` | `z.number().min(8).max(64)` | `10` | `src/app/api/auth/change-password/route.ts` | Password Policy Test |
| `passwordRequireSpecial` | `z.boolean()` | `true` | `src/app/api/auth/change-password/route.ts` | Password Policy Test |
| `passwordHistoryCount` | `z.number().min(0).max(24)` | `5` | `src/app/api/auth/change-password/route.ts` (`PasswordHistory` check) | Password Policy Test |

---

## 6. Notifications & Quiet Hours

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `emailNotificationsEnabled` | `z.boolean()` | `true` | `src/services/notifications/email.service.ts` | Phase 4 Suite |
| `webPushNotificationsEnabled` | `z.boolean()` | `true` | `src/services/notifications/push.service.ts` | Phase 4 Suite |
| `slackNotificationsEnabled` | `z.boolean()` | `true` | `src/services/integrations/slack.service.ts` | Phase 4 Suite |
| `teamsNotificationsEnabled` | `z.boolean()` | `true` | `src/services/integrations/teams.service.ts` | Phase 4 Suite |
| `quietHoursEnabled` | `z.boolean()` | `false` | `src/services/notifications/quiet-hours.ts` | Phase 4 Suite |
| `quietHoursStart` | `z.string().regex(/^([01]\d\|2[0-3]):[0-5]\d$/)` | `"21:00"` | `src/services/notifications/quiet-hours.ts` | Phase 4 Suite |
| `quietHoursEnd` | `z.string().regex(/^([01]\d\|2[0-3]):[0-5]\d$/)` | `"07:00"` | `src/services/notifications/quiet-hours.ts` | Phase 4 Suite |

---

## 7. Data Retention & Privacy (DPDP Act 2023 / GDPR)

| Setting Key | Type & Constraints | Default | Enforcing File & Function | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| `retentionPhotosDays` | `z.number().min(1).max(3650)` | `90` | `src/services/privacy/retention.service.ts` (`runDataRetentionPurge`) | `scripts/verify-phase-6-acceptance.cjs` (Test 3: Photo Purge) |
| `retentionSignaturesDays` | `z.number().min(1).max(3650)` | `180` | `src/services/privacy/retention.service.ts` (`runDataRetentionPurge`) | `scripts/verify-phase-6-acceptance.cjs` (Test 3: Signature Purge) |
| `retentionIdProofsDays` | `z.number().min(1).max(3650)` | `90` | `src/services/privacy/retention.service.ts` (`runDataRetentionPurge`) | `scripts/verify-phase-6-acceptance.cjs` (Test 3: ID Proof Purge) |
| `retentionVisitorRecordsDays` | `z.number().min(30).max(3650)` | `365` | `src/services/privacy/retention.service.ts` (`runDataRetentionPurge`) | `scripts/verify-phase-6-acceptance.cjs` (Test 3: Anonymization & Aggregate Stats) |
| `privacyPolicyNoticeVersion` | `z.string()` | `"v1.0"` | `src/app/kiosk/KioskClientView.tsx`, `src/services/privacy/retention.service.ts`, `src/app/api/privacy/consents/route.ts` | `scripts/verify-phase-6-acceptance.cjs` (Test 5: Versioned Notice) |

---

## 8. Data Principal Rights & DSAR Tools

| Tool / Action | Route / Endpoint | Required Permission | Description & Enforcement |
| :--- | :--- | :--- | :--- |
| **Data Subject Export (JSON)** | `GET /api/privacy/export?visitorId=...&format=json` | `visitors.read` | Generates structured JSON package of personal identity, visit timestamps, documents, badges, and consents. Logs `DATA_SUBJECT_EXPORT` audit event. |
| **Data Subject Export (PDF)** | `GET /api/privacy/export?visitorId=...&format=pdf` | `visitors.read` | Generates official branded vector PDF document via `pdfkit` for regulatory compliance submissions. Logs `DATA_SUBJECT_EXPORT` audit event. |
| **Data Subject Erasure (PII Anonymization)** | `POST /api/privacy/erase` | `visitors.delete` | Atomically anonymizes visitor name (`Erasure Request - [ID]`), redacts phone/email, nullifies photo/signature/document links. Retains `CheckIn` and `CheckOut` rows so aggregate security reporting stays 100% accurate. Logs `DATA_SUBJECT_ERASURE` audit event. |
| **Consent Records View** | `GET /api/privacy/consents` | `visitors.read` | Paginated immutable record of consents captured with version and timestamp. |

