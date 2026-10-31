# Entrivo Multi-Tenant Isolation & Scoping Audit

## 1. Tenant Scoping Strategy
Multi-tenancy in Entrivo is strictly enforced through `organizationId`. 

### Key Rules
1. **Never Fall Back to `{}`**: If `user.organizationId` is `null` or undefined, tenant-scoped routes immediately fail with `400 Bad Request` or `403 Forbidden` (`requireOrg` helper in `src/lib/tenant.ts`).
2. **Scoping on Every Read**: Every query (`findMany`, `findFirst`, `count`, `aggregate`) specifies `organizationId` directly or scopes through the parent relation (e.g., `visitor: { organizationId }`, `office: { branch: { organizationId } }`).
3. **Scoping on Every Mutation**: Handlers never perform unchecked mutations by `where: { id }`. They either verify ownership using `findFirst({ where: { id, organizationId } })` before updating, or use `updateMany`/`deleteMany` with `organizationId` filter.
4. **Relational Invariant Verification**: For entities linked to foreign records (e.g. attaching a document to a visitor, booking a meeting room in an office, scheduling an invitation for a host employee), the handler verifies that the foreign entity also belongs to `organizationId`.

---

## 2. Route-by-Route Tenant Isolation Matrix

| Handler / Route | Entity | Scoping Mechanism | Foreign Relation Checks |
| :--- | :--- | :--- | :--- |
| `GET /api/visitors` | `Visitor` | `where: { organizationId }` | N/A |
| `POST /api/visitors` | `Visitor` | Created with `organizationId` | `visitorTypeId` verified in tenant |
| `PATCH /api/visitors` | `Visitor` | `findFirst({ where: { id, organizationId } })` | N/A |
| `DELETE /api/visitors` | `Visitor` | `findFirst({ where: { id, organizationId } })` | N/A |
| `POST /api/visitors/checkin` | `CheckIn` | Scoped via `invitation.organizationId` | Blacklist checked within tenant |
| `POST /api/visitors/checkout` | `CheckOut` | `checkIn.visitor.organizationId === organizationId` | Transactional checkout update |
| `POST /api/visitors/walkin` | `CheckIn` | Creates `Visitor` & `CheckIn` scoped to `orgId` | `hostEmployeeId` verified in tenant |
| `GET /api/invitations` | `Invitation` | `where: { organizationId }` (+ hostEmployee for EMPLOYEE) | N/A |
| `POST /api/invitations` | `Invitation` | Created with `organizationId` | `hostEmployeeId`, `meetingRoomId` checked |
| `PATCH /api/invitations` | `Invitation` | `findFirst({ where: { id, organizationId } })` | Host employee ownership verified |
| `DELETE /api/invitations` | `Invitation` | `findFirst({ where: { id, organizationId } })` | Host employee ownership verified |
| `POST /api/invitations/verify-qr` | `Invitation` | `findFirst({ where: { qrToken, organizationId } })` | Raw invitation ID bypass removed |
| `GET /api/employees` | `Employee` | `where: { organizationId }` | N/A |
| `POST /api/employees` | `Employee` | Created with `organizationId` | Department / Office verified in tenant |
| `PUT /api/employees` | `Employee` | `findFirst({ where: { id, organizationId } })` | Privilege escalation rules checked |
| `DELETE /api/employees` | `Employee` | `findFirst({ where: { id, organizationId } })` | Last admin invariant checked |
| `GET /api/approvals` | `Approval` | `where: { invitation: { organizationId } }` | Scoped by invitation tenant |
| `POST /api/approvals` | `Approval` | `findFirst({ where: { id, invitation: { organizationId } } })` | Non-admin requires `approverId === own` |
| `GET /api/documents` | `Document` | `where: { visitor: { organizationId } }` | Scoped through visitor relation |
| `POST /api/documents` | `Document` | `visitor.organizationId === organizationId` | Target visitor verified in tenant |
| `DELETE /api/documents` | `Document` | `findFirst({ where: { id, visitor: { organizationId } } })` | Scoped through visitor relation |
| `GET /api/meeting-rooms` | `MeetingRoom` | `where: { office: { branch: { organizationId } } }` | Scoped through branch relation |
| `POST /api/meeting-rooms` | `MeetingRoom` | Office verified: `branch: { organizationId }` | Branch and office verified in tenant |
| `PUT /api/meeting-rooms` | `MeetingRoom` | `findFirst({ where: { id, office: { branch: { organizationId } } } })` | Tenant boundary asserted before update |
| `DELETE /api/meeting-rooms` | `MeetingRoom` | `findFirst({ where: { id, office: { branch: { organizationId } } } })` | Tenant boundary asserted before delete |
| `GET /api/organization` | `Organization` | `where: { id: user.organizationId }` | Strictly current user tenant |
| `PUT /api/organization` | `Organization` | `where: { id: user.organizationId }` | Strictly current user tenant |
| `GET /api/integrations` | `Setting`, `Webhook` | `where: { organizationId }` | Masked secrets returned |
| `POST /api/integrations` | `Setting`, `Webhook` | Created with `organizationId` | Whitelisted keys & SSRF protection |
| `DELETE /api/integrations` | `Webhook` | `findFirst({ where: { id, organizationId } })` | Tenant boundary asserted before delete |
| `GET /api/security/blacklist` | `BlacklistVisitor` | `where: { organizationId }` | Strictly current user tenant |
| `POST /api/security/blacklist` | `BlacklistVisitor` | Created with `organizationId` | Matching visitors scoped to tenant |
| `DELETE /api/security/blacklist` | `BlacklistVisitor` | `findFirst({ where: { id, organizationId } })` | Tenant boundary asserted before delete |
| `GET /api/security/logs` | `SecurityLog` | `where: { organizationId }` | Strictly current user tenant |
| `GET /api/reports/export` | `CheckIn` | `where: { visitor: { organizationId } }` | Scoped through visitor relation |
| `GET /api/dashboard/stats` | Aggregates | All counts & charts scoped to `organizationId` | No global aggregates returned |
| `GET/POST/PUT/DELETE /api/notifications/templates` | `Template` | `where: { organizationId }` | Pre-verification before update/delete |
| `GET /api/search` | Cross-entity | Every query (`visitor`, `employee`, `invitation`, `checkIn`) scoped to `organizationId` | No cross-tenant leakage |

---

## 3. Public Endpoints Verification
- `/pass/[token]`: Requires secret signed or unique random `qrToken`. Removed legacy fallback to raw database `id`. Does not expose tenant internal IDs or credentials.
- `/kiosk`: Kiosk registration generates touchless check-ins scoped to the organization hosting the kiosk terminal.
- `/api/cron/auto-checkout`: Protected by constant-time Bearer token comparison (`CRON_SECRET`). Operates system-wide to close stale open visits safely.
