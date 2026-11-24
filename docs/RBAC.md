# Entrivo Role-Based Access Control (RBAC) Architecture

## 1. Overview & Single Source of Truth
All authorization decisions in Entrivo are governed by `src/lib/rbac.ts`. No route or component implements ad-hoc role comparisons.

The permission model is built around a strongly-typed string union (`Permission`), mapped to roles via `ROLE_PERMISSIONS`:
- **SUPER_ADMIN**: Global system authority (implicit bypass: `can()` returns `true` for all permissions).
- **ORG_ADMIN**: Full tenant authority (organization, employees, visitors, invitations, settings, integrations, templates, security logs, blacklists, audit logs).
- **RECEPTIONIST**: Front-desk operations (check-in, check-out, walk-ins, badge generation, invitations creation, visitor directory, documents, meeting rooms).
- **SECURITY_GUARD**: Physical security & gate clearance (check-in, check-out, walk-ins, approvals, blacklist read/write, security incident logs, documents, visitor passes).
- **EMPLOYEE**: Workplace tenant member (dashboard, own invitations create/view/cancel/reschedule, approvals where assigned as host/approver, employee directory, meeting room availability, notification center).

---

## 2. Permission Matrix

| Permission | SUPER_ADMIN | ORG_ADMIN | RECEPTIONIST | SECURITY_GUARD | EMPLOYEE |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `dashboard.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `visitors.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `visitors.write` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `visitors.delete` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `invitations.create` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `invitations.bulk` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `invitations.series.manage` | ✅ | ✅ | ✅ | ❌ | ✅ (own series) |
| `invitations.read.all` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `invitations.read.own` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `preregistration.read` | ✅ | ✅ | ✅ | ❌ | ✅ (own invitations) |
| `preregistration.manage` | ✅ | ✅ | ✅ | ❌ | ✅ (own invitations) |
| `walkin.create` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `walkin.override` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `checkin.perform` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `checkout.perform` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `qr.verify` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `approvals.act` | ✅ | ✅ | ❌ | ✅ | ✅ (own invitations only) |
| `blacklist.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `blacklist.manage` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `securityLogs.read` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `employees.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `employees.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `org.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `settings.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `integrations.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `templates.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `audit.read` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `kiosks.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `documents.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `documents.manage` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `meetingRooms.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `meetingRooms.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `reports.view` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `reports.export` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `feedback.read` | ✅ | ✅ | ✅ | ❌ | ✅ (own hosted visits) |
| `feedback.manage` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `analytics.view` | ✅ | ✅ | ✅ | ❌ | ✅ (own hosted visits) |
| `analytics.export` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `sessions.self` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `notifications.self` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `notifications.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `apikeys.read` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `apikeys.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `webhooks.read` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `webhooks.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `parking.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `parking.assign` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `parking.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `deliveries.log` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `deliveries.read.own` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `deliveries.read.all` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `contractors.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `contractors.manage` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `compliance.override` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `selfcheckin.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `selfcheckin.confirm` | ✅ | ✅ | ✅ | ✅ | ✅ (assigned host only) |
| `muster.view` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `muster.broadcast` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `muster.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `muster.account` | ✅ | ✅ | ❌ | ✅ | ❌ |

---

## 3. Privilege Escalation Guards
Implemented in `src/lib/rbac.ts` (`canAssignRole` & `validateRoleChange`):
1. **Self-Promotion Guard**: No user can modify their own role.
2. **SUPER_ADMIN Boundary**: Only an active `SUPER_ADMIN` can assign or create another `SUPER_ADMIN`. An `ORG_ADMIN` attempting to elevate an account to `SUPER_ADMIN` receives a 403 Forbidden.
3. **Last Admin Invariant**: An organization must always retain at least one active `ORG_ADMIN`. Demoting or deactivating the last administrator is blocked with a 400 Bad Request.

---

## 4. Route-by-Route Enforcement Table

| Route | Method | Required Permission / Guard | Enforcement Type |
| :--- | :---: | :--- | :--- |
| `/api/approvals` | GET | `approvals.act` | API `requirePermission` |
| `/api/approvals` | POST | `approvals.act` (+ approverId check for EMPLOYEE) | API `requirePermission` |
| `/api/visitors` | GET | `visitors.read` | API `requirePermission` |
| `/api/visitors` | POST, PATCH | `visitors.write` | API `requirePermission` |
| `/api/visitors` | DELETE | `visitors.delete` | API `requirePermission` |
| `/api/visitors/checkin` | POST | `checkin.perform` | API `requirePermission` |
| `/api/visitors/checkout` | POST | `checkout.perform` | API `requirePermission` |
| `/api/visitors/walkin` | POST | `walkin.create` | API `requirePermission` |
| `/api/visitors/walkin/override` | POST | `walkin.override` | API permission + organization scope + Zod + rate limit; atomic standard check-in checks and audit |
| `/api/invitations` | GET | `invitations.read.all` or `invitations.read.own` | API `requireAnyPermission` |
| `/api/invitations` | POST | `invitations.create` | API `requirePermission` |
| `/api/invitations` | PATCH, DELETE | `invitations.create` (EMPLOYEE scoped to own) | API `requirePermission` |
| `/api/invitations/group` | POST | `invitations.create` | API `requirePermission` + organization group-size policy |
| `/api/invitations/group/template` | GET | `invitations.create` | API `requirePermission` + rate limit |
| `/api/invitations/group/:id` | GET | `invitations.read.all` or `invitations.read.own`; POST `checkin.perform` | API permission + organization scope |
| `/api/invitations/bulk` | GET, POST | `invitations.bulk` | API `requirePermission` + upload rate limit |
| `/api/invitations/bulk/:id` | GET, POST | `invitations.bulk` | API `requirePermission` + organization-scoped job |
| `/api/invitations/bulk/:id/report` | GET | `invitations.bulk` | API `requirePermission` + organization-scoped file |
| `/api/invitation-series` | GET, POST | `invitations.series.manage` | API `requirePermission` + organization scope |
| `/api/invitation-series/:id` | PATCH | `invitations.series.manage` | API `requirePermission` + organization scope |
| `/api/invitation-series/:id/calendar` | GET | `invitations.series.manage` | API `requirePermission` + organization scope |
| `/api/visitors/:id/vendor` | PATCH | `visitors.write` | API `requirePermission` + organization scope |
| `/api/invitations/verify-qr` | POST | `qr.verify` | API `requirePermission` |
| `/api/preregistrations` | GET | `preregistration.read` (+ invitations scoped to own host for employees) | API `requirePermission` + organization scope |
| `/api/preregistrations/:id` | PATCH | `preregistration.manage` (+ invitations scoped to own host for employees) | API `requirePermission` + organization scope |
| `/api/employees` | GET | `employees.read` | API `requirePermission` |
| `/api/employees` | POST, PUT, DELETE | `employees.manage` (+ escalation checks) | API `requirePermission` |
| `/api/organization` | GET | `requireUser` | API `requireUser` |
| `/api/organization` | PUT | `org.manage` | API `requirePermission` |
| `/api/integrations` | GET, POST, DELETE | `integrations.manage` | API `requirePermission` |
| `/api/documents` | GET | `documents.read` | API `requirePermission` |
| `/api/documents` | POST, DELETE | `documents.manage` | API `requirePermission` |
| `/api/meeting-rooms` | GET | `meetingRooms.read` | API `requirePermission` |
| `/api/meeting-rooms` | POST, PUT, DELETE | `meetingRooms.manage` | API `requirePermission` |
| `/api/security/blacklist` | GET | `blacklist.read` | API `requirePermission` |
| `/api/security/blacklist` | POST, DELETE | `blacklist.manage` | API `requirePermission` |
| `/api/security/logs` | GET | `securityLogs.read` | API `requirePermission` |
| `/api/parking/lots` | GET | `parking.read` | API permission + organization scope |
| `/api/parking/lots` | POST, PATCH | `parking.manage` | API permission + Zod + rate limit + audit |
| `/api/parking/slots` | POST | `parking.manage` | API permission + Zod + rate limit + audit |
| `/api/parking/slots/:id` | PATCH | `parking.manage` | API permission + Zod + rate limit + audit |
| `/api/parking/availability`, `/api/parking/vehicles` | GET | `parking.read` | API permission + organization scope |
| `/api/parking/assignments` | GET | `parking.read` | API permission + organization scope |
| `/api/parking/assignments` | POST | `parking.assign` | API permission + organization scope; rate limited and audited |
| `/api/parking/assignments/:id` | PATCH | `parking.assign` | API permission + organization scope; rate limited and audited |
| `/api/parking/events` | POST | `parking.assign` | API permission + organization scope; rate limited and audited |
| `/api/parking/permits` | GET | `parking.read` | API permission + organization scope |
| `/api/parking/permits` | POST | `parking.manage` | API permission + Zod + rate limit + audit |
| `/api/parking/report` | GET | `reports.export` | API permission + organization scope; rate limited and audited |
| `/api/self-checkin/points` | GET, POST | `selfcheckin.manage` | API permission + organization-scoped office validation + rate limit + audit |
| `/api/self-checkin/points/:id` | PATCH | `selfcheckin.manage` | API permission + tenant-scoped point + rate limit + audit |
| `/api/self-checkin/points/:id/qr` | GET | `selfcheckin.manage` | API permission + tenant-scoped active point + rate limit; no-store rotating signed QR |
| `/api/self-checkin/sessions` | GET | `selfcheckin.confirm` | API permission + tenant scope + host-only queue visibility for employees |
| `/api/self-checkin/sessions/:id/decision` | POST | `selfcheckin.confirm` | API permission + tenant scope + host/desk approver check + rate limit + audit |
| `/api/public/self-checkin` | POST | Public rotating-QR/session capability | Zod, generic errors, JSON/same-origin, rate limits, honeypot, hashed request metadata, expiring hashed credentials |
| `/api/muster` | GET | `muster.view` | API permission + organization scope + audit |
| `/api/muster/events` | GET, POST | `muster.view`, `muster.broadcast` | API permission + organization scope + Zod + rate limit + audit |
| `/api/muster/events/:id` | GET | `muster.view` | API permission + organization scope + audit |
| `/api/muster/events/:id/entries/:entryId` | PATCH | `muster.account` | API permission + organization scope + Zod + idempotency + rate limit + audit |
| `/api/muster/events/:id/all-clear` | POST | `muster.broadcast` | API permission + organization scope + rate limit + audit |
| `/api/muster/events/:id/deliveries` | GET, POST | `muster.view`, `muster.broadcast` | API permission + organization scope + rate limit + audit |
| `/api/muster/points` | GET, POST | `muster.view`, `muster.manage` | API permission + organization scope + Zod + rate limit + audit |
| `/api/muster/points/:id` | PATCH, DELETE | `muster.manage` | API permission + tenant-scoped point + audit |
| `/api/reports/export` | GET | `reports.export` | API `requirePermission` |
| `/api/feedback` | GET, PATCH | `feedback.read`, `feedback.manage` | API permission + organization scope + cursor filters |
| `/api/feedback/qr` | POST | `feedback.read` | API permission + organization scope + rate limit |
| `/api/public/feedback` | POST | Public token/signed QR capability | Hash, expiry, rate limit, honeypot, tenant/atomic checks |
| `/api/kiosk/feedback-qr` | POST | Kiosk device authentication | Organization-scoped signed QR + audit |
| `/api/analytics` | GET | `analytics.view` | API permission + organization scope + EMPLOYEE hosted-visit scope |
| `/api/analytics/export` | GET | `analytics.export` | API permission + organization scope + export rate limit/audit |
| `/api/dashboard/stats` | GET | `dashboard.view` | API `requirePermission` |
| `/api/notifications/templates` | GET, POST, PUT, DELETE | `templates.manage` | API `requirePermission` |
| `/api/notifications/test-email` | POST | `templates.manage` | API `requirePermission` |
| `/api/notifications/delivery-log` | GET, POST | `notifications.manage` | API `requirePermission` |
| `/api/notifications/preferences` | GET, PUT | `notifications.self` | API `requirePermission` |
| `/api/cron/reminders` | POST | Constant-time `Authorization: Bearer CRON_SECRET` | Header Bearer Guard |
| `/api/cron/daily-report` | POST | Constant-time `Authorization: Bearer CRON_SECRET` | Header Bearer Guard |
| `/api/auth/sessions` | GET, DELETE | `sessions.self` | API `requireUser` (scoped to user.id) |
| `/api/cron/auto-checkout` | POST | Constant-time `Authorization: Bearer CRON_SECRET` | Header Bearer Guard |
| `/api/cron/walkin-approval-escalation` | GET, POST | Constant-time `Authorization: Bearer CRON_SECRET` | Rate-limited system sweep; escalation records are tenant-scoped and audited |
| `/api/kiosk` | GET, POST | `kiosks.manage` or `settings.manage` | API `requireAnyPermission` |
| `/api/kiosk/:id` | DELETE | `kiosks.manage` or `settings.manage` | API `requireAnyPermission` |
| `/api/kiosk/:id/repair` | POST | `kiosks.manage` or `settings.manage` | API `requireAnyPermission` |
| `/api/kiosk/pair` | POST | Rate-limited pairing code lookup (public) | Pairing Code Guard |
| `/api/kiosk/checkin` | POST | Device token cookie (`kiosk_token`), org-scoped | Kiosk Hardware Cookie Guard |
| `/api/kiosk/walkin` | POST | Device token cookie (`kiosk_token`), org-scoped | Kiosk Hardware Cookie Guard |
| `/api/kiosk/verify-qr` | POST | Device token cookie (`kiosk_token`), org-scoped | Kiosk Hardware Cookie Guard |

---

## 5. UI Navigation & Page Protection
1. **Dynamic Navigation (`src/components/layout/Sidebar.tsx`)**: Each navigation item defines its required `Permission`. Items for which the current user lacks permission are omitted from the DOM entirely.
2. **Server Page Guards (`src/lib/rbac.ts` `requirePagePermission`)**: Each dashboard page executes `requirePagePermission(perm)` on the server before database queries occur. Unauthorized requests are immediately redirected to `/forbidden`.
3. **Forbidden Page (`/forbidden`)**: A production-grade glass-card UI displaying user credentials, requested action, and contact link to the organization administrator.

