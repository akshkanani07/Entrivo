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
| `invitations.read.all` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `invitations.read.own` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `walkin.create` | ✅ | ✅ | ✅ | ✅ | ❌ |
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
| `documents.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `documents.manage` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `meetingRooms.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `meetingRooms.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `reports.view` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `reports.export` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `sessions.self` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `notifications.self` | ✅ | ✅ | ✅ | ✅ | ✅ |

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
| `/api/invitations` | GET | `invitations.read.all` or `invitations.read.own` | API `requireAnyPermission` |
| `/api/invitations` | POST | `invitations.create` | API `requirePermission` |
| `/api/invitations` | PATCH, DELETE | `invitations.create` (EMPLOYEE scoped to own) | API `requirePermission` |
| `/api/invitations/verify-qr` | POST | `qr.verify` | API `requirePermission` |
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
| `/api/reports/export` | GET | `reports.export` | API `requirePermission` |
| `/api/dashboard/stats` | GET | `dashboard.view` | API `requirePermission` |
| `/api/notifications/templates` | GET, POST, PUT, DELETE | `templates.manage` | API `requirePermission` |
| `/api/notifications/test-email` | POST | `templates.manage` | API `requirePermission` |
| `/api/auth/sessions` | GET, DELETE | `sessions.self` | API `requireUser` (scoped to user.id) |
| `/api/cron/auto-checkout` | POST | Constant-time `Authorization: Bearer CRON_SECRET` | Header Bearer Guard |

---

## 5. UI Navigation & Page Protection
1. **Dynamic Navigation (`src/components/layout/Sidebar.tsx`)**: Each navigation item defines its required `Permission`. Items for which the current user lacks permission are omitted from the DOM entirely.
2. **Server Page Guards (`src/lib/rbac.ts` `requirePagePermission`)**: Each dashboard page executes `requirePagePermission(perm)` on the server before database queries occur. Unauthorized requests are immediately redirected to `/forbidden`.
3. **Forbidden Page (`/forbidden`)**: A production-grade glass-card UI displaying user credentials, requested action, and contact link to the organization administrator.
