# Entrivo Schema Changes (P11-U6 Visitor Profile)

## P11-U6.2 Invitation Detail Reminder History

- Added nullable `Invitation.visitorReminder24hSentAt` and `Invitation.visitorReminder1hSentAt` timestamps.
- The reminder worker atomically claims each reminder before dispatch, preventing repeated 24-hour/1-hour reminders and exposing the queue time in invitation detail.
- Migration: `prisma/migrations/20261124134500_p11_u6_invitation_reminders/migration.sql`.

## P11-U6.1 Visitor Profile Notes and VIP Flag

- Added `VisitorNote` with tenant, visitor, and optional author relations; notes are retained in the profile and removed by the existing personal-data erasure transaction.
- Added `Visitor.isVip` with a false default.
- Migration: `prisma/migrations/20261124131500_p11_u6_visitor_notes/migration.sql`.

---

# Entrivo Schema Changes (P10-H Self Check-In)

## P10-H.1 Front-Desk Check-In

- Added `SelfCheckinPoint` with tenant/office ownership, active state, and a version used to revoke outstanding rotating desk QR tokens.
- Added `SelfCheckinSession` with invitation/visitor/host/check-in relations, status and method state, expiry, hashed session/IP/UA/email/OTP/idempotency metadata, encrypted submission payload, and escalation/completion claims.
- Added `SelfCheckinPointStatus`, `SelfCheckinStatus`, and `SelfCheckinMethod` enums and organization/status/expiry indexes.
- Migration: `prisma/migrations/20261124110000_p10_h_self_checkin/migration.sql`.
- Public self-check-in sessions hold only encrypted pending submission data and hashed bearer/OTP credentials; expired or rejected sessions clear sensitive payload fields.

---

# Entrivo Schema Changes (P10-G Feedback Foundation)

## P10-G.1 Visitor Feedback and Analytics Foundation

- Added `Visitor.preferredLocale: String @default("en-IN")`.
- Added `CheckIn.hostNotifiedAt` and `CheckIn.meetingStartedAt` for wait-time measurement.
- Added `Employee.managerId` with a self-relation for host-manager detractor routing.
- Added `FeedbackRequest` with organization and unique check-in scope, SHA-256 token storage, expiry, send metadata, and supporting indexes.
- Added `FeedbackResponse` with organization scope, optional check-in/host/branch/office attribution, NPS/CSAT scores, categories, sanitized comment storage, source, abuse metadata, review state, internal note, and analytics indexes.
- Added `FeedbackCategory`, `FeedbackChannel`, and `FeedbackSource` enums.
- Added supporting invitation, check-out, and host/check-in indexes for no-show, duration, and wait-time aggregates.
- Migration: `prisma/migrations/20261123202500_p10_g_feedback_foundation/migration.sql`.

The migration also adds a unique visit-response constraint, preventing duplicate responses for a single check-in; `FeedbackRequest.consumedAt` provides atomic email-token consumption state. Seeded feedback and visit timestamps support deterministic feedback/heatmap smoke tests.

---

# Entrivo Schema Changes (Phase 5)

## 1. AuditLog Model Indexes
Added compound and query-specific indexes to optimize audit queries and filtering:
- `@@index([organizationId, createdAt])`: Accelerates chronological timeline queries.
- `@@index([organizationId, action])`: Speeds up action-specific filter views.
- `@@index([organizationId, entity])`: Optimizes entity-specific change logs.

## 2. Report Model Enhancements
Expanded `Report` model to support saved parameters and scheduled exports:
- `parameters Json?`: Stores structured filter configurations (`departmentId`, `visitorTypeId`, `branchId`, `status`, etc.).
- `isScheduled Boolean @default(false)`: Distinguishes manual reports from automated scheduled reports.
- `scheduleCron String?`: Cron recurrence pattern (e.g. `0 8 * * 1` for weekly on Mondays).
- `recipients String?`: Comma-separated email distribution list.
- `lastSentAt DateTime?`: Timestamp of last automated email dispatch.
- Added compound index: `@@index([organizationId, isScheduled])`.

## 3. CheckIn Model Query Optimization Indexes
Added dedicated join and filter indexes:
- `@@index([visitorId])`: Accelerates visitor-to-checkin joins in reports.
- `@@index([hostEmployeeId])`: Accelerates employee-to-checkin joins and top hosts chart aggregation.
- `@@index([checkInTime, status])`: Optimizes footfall volume, dwell-time, and active premises telemetry queries.


All database schema updates are applied directly using `prisma db push` (PostgreSQL).

## 1. User & Consent Fields
- Added `consentVersion: String?`: Tracks the legal version accepted by the user (e.g. `"2026-04-18"`).
- Added `consentAt: DateTime?`: Timestamp when terms & privacy policy were accepted.
- Added `mustChangePassword: Boolean @default(false)`: Flag requiring immediate password change on first sign-in or admin reset.
- Added `failedLoginAttempts: Int @default(0)`: Failed sign-in attempt counter for exponential lockout.
- Added `lockedUntil: DateTime?`: Temporary lockout expiration timestamp.

## 2. Kiosk Model
Added dedicated `Kiosk` entity for hardware terminal pairing and unattended check-in:
```prisma
model Kiosk {
  id               String       @id @default(cuid())
  organizationId   String
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name             String
  deviceTokenHash  String?      @unique // SHA-256 hash of random 32-byte terminal token
  pairingCodeHash  String?      @unique // SHA-256 hash of temporary 8-digit numeric pairing code
  pairingExpiresAt DateTime?    // 10-minute TTL for pairing code
  lastUsedAt       DateTime?
  expiresAt        DateTime?    // Rolling renewal expiration timestamp (180 days)
  isActive         Boolean      @default(true)
  createdById      String?      // User ID of the admin who provisioned the kiosk
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@index([organizationId])
  @@index([deviceTokenHash])
}
```

## 3. PushSubscription Model
Added dedicated `PushSubscription` entity for browser Web Push notifications (VAPID):
```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}


---

# Entrivo Schema Changes (Phase 3)

## 1. Document Model Enhancements
- Scoped `Document` to `Organization`:
  - `organizationId String`: Organization relation with cascade deletion.
  - `fileId String?`: Optional relation to `File` model (`onDelete: SetNull`).
  - `fileSize Int?`: Size in bytes.
  - `mimeType String?`: Verified MIME type.
  - `sha256 String?`: SHA-256 integrity hash of document payload.
  - `status String @default("VALID")`: Computed lifecycle status (`VALID`, `EXPIRING`, `EXPIRED`).
  - `metadata Json?`: Audit metadata (templateVersion, contentHash, signer IP, device/user-agent, timestamps).
  - `createdById String?`: Audit user ID for actor tracking.
  - Indexes: `@@index([organizationId])`, `@@index([visitorId])`, `@@index([docType])`, `@@index([expiryDate])`, `@@index([status])`.

## 2. NdaTemplate Model
Added dedicated `NdaTemplate` entity for organization-configurable NDA contracts:
```prisma
model NdaTemplate {
  id             String        @id @default(cuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  title          String        @default("Standard Visitor Non-Disclosure Agreement")
  content        String        @db.Text
  version        String        @default("1.0")
  validityDays   Int           @default(365)
  isActive       Boolean       @default(true)
  createdById    String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([organizationId])
}
```


## 1. Storage & Files Foundation
- Added `model File`:
  - `id`: CUID identifier
  - `organizationId`: Tenant scoping
  - `ownerType`: Identifier for file purpose (`VISITOR_PHOTO`, `ID_PROOF`, `NDA_DOCUMENT`, `ORG_LOGO`, `SIGNATURE`)
  - `ownerId`: Foreign key / reference ID
  - `key`: Storage adapter object path
  - `mime`: Verified MIME type (validated with magic bytes)
  - `size`: Byte count
  - `sha256`: Cryptographic content checksum
  - `createdById`: Author / uploader
  - `deletedAt`: Soft delete tracking

## 2. Authentication & Security
- `EmailVerificationToken`: Token hash, 24-hour expiration, and atomic single-use status for user email validation.
- `User`:
  - `twoFactorBackupCodes`: JSON string of hashed single-use backup recovery codes.
  - `twoFactorConfirmedAt`: Timestamp when 2FA was activated.
- `Session`:
  - `lastActiveAt`: Tracking timestamp for server-side idle timeout enforcement.
- `PasswordHistory`:
  - `userId`, `passwordHash`, `createdAt`: Tracks historical bcrypt hashes to prevent immediate password reuse.

## 3. Organization Profile & Spatial Structure
- `Organization`:
  - `brandColor`: Hex brand color code (default `#4f46e5`).
  - `locale`: Locale code (default `en-IN`).
- `Branch`:
  - `workingHours`: JSON configuration for weekday operating hours.
- `Office`:
  - `workingHours`: JSON configuration for weekday operating hours.
- `Floor`:
  - Represents building floors linked to `Office`, with floor name and integer number.
- `Zone`:
  - Represents spatial wings/zones on a `Floor`.
- `MeetingRoom`:
  - Added `floorId` (`floorRef`) and `zoneId` (`zoneRef`) relations.
- `Holiday`:
  - Added `branchId` (branch-specific holidays), `endDate` (date ranges), `isRecurring` (annual recurrence), and `description`.
```

---

# Entrivo Schema Changes (Phase 4)

## 1. Notification Model (Delivery Log, 24h Metrics & Retry)
Added fields and indexes for message delivery tracking, multi-channel retry, and dead-letter queue:
- `recipient: String?`: Recipient address (email, webhook target, or endpoint identifier).
- `retryCount: Int @default(0)`: Number of retry attempts.
- `lastAttemptAt: DateTime?`: Timestamp of the most recent delivery attempt.
- `deliveredAt: DateTime?`: Successful delivery timestamp.
- `isDeadLetter: Boolean @default(false)`: Flag for messages exceeding maximum retries (dead-letter queue).
- Indexes:
  - `@@index([organizationId, channel, status])`
  - `@@index([organizationId, isDeadLetter])`

## 2. NotificationTemplate Model (Overrides, Approval Workflow & Locale)
Expanded `NotificationTemplate` to support multi-language templates, versioning, and approval workflow (`DRAFT` -> `PENDING_APPROVAL` -> `ACTIVE`):
- `locale: String @default("en")`: Locale code (`en`, `hi`, `gu`).
- `status: String @default("ACTIVE")`: Lifecycle status (`DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `ARCHIVED`).
- `version: Int @default(1)`: Monotonically increasing revision number.
- `approvedById: String?`: ID of the administrator who approved the template.
- `approvedBy: User? @relation("TemplateApprover")`: Relation to approving user.
- `approvedAt: DateTime?`: Timestamp of approval.
- Indexes:
  - `@@index([organizationId, event, channel, locale])`
  - `@@index([organizationId, status])`

## 3. User & Employee (Quiet Hours & Delegation)
- `User.quietHoursEnabled: Boolean @default(false)`: Enables notification silencing outside working hours.
- `User.quietHoursStart: String? @default("22:00")`: Quiet hours start time (HH:mm format).
- `User.quietHoursEnd: String? @default("07:00")`: Quiet hours end time (HH:mm format).
- `Employee.backupApproverId: String?`: Designated backup host/approver for out-of-office delegation.

---

# Entrivo Schema Changes (Phase 7)

## PWA and Offline Storage Architecture
No PostgreSQL database migrations were required for Phase 7.
- **Client-Side Storage**: Offline queuing and cached expected visitor records reside in browser IndexedDB (`entrivo_offline_db`) using object stores `offline_queue` and `expected_visitors`.
- **Idempotency State**: Replay-safety and deduplication caching for `Idempotency-Key` headers operate via high-performance in-memory LRU cache mirrored to Redis (`idemp:*`, 24-hour TTL) with zero relational schema overhead.

---

# Entrivo Schema Changes (Phase 8)

## 1. ApiKey Model Enhancement
Enhanced `ApiKey` to support granular REST permissions, configurable per-key rate limiting, active status toggling, and fast hash lookups:
- `scopes: String @default("visitors:read,invitations:read")`: Comma-separated REST permission scopes.
- `rateLimit: Int @default(120)`: Maximum allowed requests per minute.
- `isActive: Boolean @default(true)`: Revocation/active state flag.
- `createdById: String?`: User who generated the API key.
- Index: `@@index([keyHash])` for O(1) Bearer token lookup.

## 2. WebhookSubscription Model Enhancement
Added failure tracking, circuit breaker auto-disable, and delivery relations:
- `failureCount: Int @default(0)`: Number of consecutive delivery failures.
- `lastFailureAt: DateTime?`: Timestamp of most recent failure.
- `lastSuccessAt: DateTime?`: Timestamp of most recent successful delivery.
- `disabledReason: String?`: Reason recorded when auto-disabled after 5 failures.
- Relation: `deliveries WebhookDelivery[]`: History of outbound delivery attempts.

## 3. WebhookDelivery Model (New)
Persistent delivery log recording all outbound webhook attempts, HTTP telemetry, and retry status:
- `id: String @id @default(cuid())`
- `webhookSubscriptionId: String`: Relation to parent webhook subscription.
- `organizationId: String`: Enforces tenant-isolated delivery auditing.
- `event: String`: Event type (e.g., `visitor.invited`, `approval.decided`).
- `payload: Json`: Delivery payload.
- `status: String @default("PENDING")`: Delivery status (`SUCCESS`, `FAILED`, `PENDING`).
- `statusCode: Int?`: Remote HTTP status code.
- `responseBody: String?`: Truncated response body (up to 2000 chars) for debugging.
- `errorMessage: String?`: Network error or timeout description.
- `attempts: Int @default(1)`: Delivery attempt count.
- `durationMs: Int?`: Round-trip request latency in milliseconds.
- `deliveredAt: DateTime?`: Successful delivery timestamp.
- Indexes:
  - `@@index([webhookSubscriptionId, createdAt])`
  - `@@index([organizationId, createdAt])`
  - `@@index([organizationId, status])`

## 4. CalendarConnection Model (New)
Host-level OAuth calendar credentials with encrypted tokens:
- `id: String @id @default(cuid())`
- `userId: String`: Employee user ID.
- `organizationId: String`: Tenant isolation.
- `provider: String`: OAuth provider (`GOOGLE`, `OUTLOOK`).
- `accountEmail: String?`: Connected calendar account email.
- `encryptedAccessToken: String`: AES-256-GCM encrypted access token.
- `encryptedRefreshToken: String?`: AES-256-GCM encrypted refresh token.
- `expiresAt: DateTime?`: Access token expiry.
- `calendarId: String? @default("primary")`: Target calendar identifier.
- `isActive: Boolean @default(true)`: Connection status flag.
- Constraint: `@@unique([userId, provider])`
- Index: `@@index([organizationId])`

## 5. Invitation Model Enhancement
Linked external calendar events for automated synchronize/cancel/reschedule actions:
- `calendarEventId: String?`: Remote Google / Outlook event identifier.
- `calendarProvider: String?`: Provider tag (`GOOGLE` or `OUTLOOK`).

## 6. Visitor Pre-Registration (P10-A)
- `PreRegistration`: one record per invitation with organization and visitor relations, unique invitation/token-hash constraints, expiry, workflow status, completeness, review metadata, locale, consent version/time, and resumable JSON draft. Indexes cover organization, status, and token expiry.
- `Visitor.idProofNumberMasked`: masked display value; pre-registration encrypts non-Aadhaar ID numbers using the shared application encryption helper and minimizes Aadhaar-like values to their last four digits.
- `Vehicle`: tenant-scoped optional visitor association, normalized plate number and display plate, type, and creation time. Unique constraint covers organization, normalized plate, and visitor.
- Migration: `prisma/migrations/20261123153500_p10_a_preregistration/migration.sql`.

## 7. Emergency Muster (P10-B)
- Added `EmergencyEvent` for organization-scoped emergency lifecycle, location scope, starter, message, and summary.
- Added `MusterPoint` for office muster locations; `MusterAccountEntry` stores an event-scoped subject snapshot and current roll-call state; `MusterAccountAction` records idempotent, actor-attributed status actions; `EmergencyDelivery` tracks notification delivery state.
- Unique event/client-event keys and event/status indexes support replay-safe accounting and live event reporting.
- Migration: `prisma/migrations/20261123163800_p10_b_muster/migration.sql`.

## 8. Localization groundwork (P10-C; partial)
- No dedicated P10-C migration is present. `Organization.locale` and `NotificationTemplate.locale` support existing locale-aware behavior.
- `PreRegistration.locale` was added with P10-A and `Visitor.preferredLocale` with P10-G; these fields and multilingual notification templates are groundwork only.
- Full application-wide locale routing and localized page coverage remain unimplemented.

## 9. Recurring and Group Visits (P10-D)
- `InvitationVisitor` stores each visitor membership, status, and unique per-person QR token. The migration backfills one membership from every existing invitation's legacy `visitorId` and `qrToken`; those fields remain on `Invitation` for single-visitor compatibility.
- `Invitation` now has nullable `seriesId` and `occurrenceDate`, an `isException` flag, and a unique `(seriesId, occurrenceDate)` key to make occurrence materialization idempotent.
- `InvitationSeries` stores the tenant, host, either an existing visitor or JSON group definition, recurrence rule, local visit times/timezone, end-date or occurrence-count constraint, holiday preference, approval metadata, and rolling materialization cursor.
- `BulkImportJob` records tenant, creator, re-verified host, upload file, row counts, workflow status, and generated error-report file.
- `PreRegistration.invitationId` is no longer unique because a group invitation has a distinct visitor-specific pre-registration; uniqueness is `(invitationId, visitorId)`. Existing records remain valid.
- `Visitor.isRegularVendor` enables vendor quick re-invites.
- Migration: `prisma/migrations/20261123174400_p10_d_recurring_group_visits/migration.sql`. Apply after the prior P10-A/P10-B migrations; the backfill must run before dropping the legacy single pre-registration uniqueness constraint.

## 10. Parking and Vehicle Management (P10-E)
- `ParkingLot` belongs to an organization and office; `ParkingSlot` stores a unique code and slot type within each lot.
- `Vehicle` gains optional make/color fields; `BlacklistVisitor` gains an optional normalized vehicle plate match.
- `ParkingAssignment` stores organization-scoped vehicle/slot reservations, optional invitation/check-in links, status transitions, reservation/entry/exit timestamps, and `overstayedAt` for historical utilization reports.
- `ParkingEvent` records vehicle entry/exit gate activity, actor, source, and event time. `ContractorPermit` stores a vehicle's permit validity window.
- Active slot conflicts are prevented by serializable assignment transactions and row-level `SELECT ... FOR UPDATE` locking. The database migration does not install a partial unique index for active assignments.
- Migration: `prisma/migrations/20261124100000_p10_e_parking/migration.sql`. It adds the parking tables/enums, vehicle attributes, blacklist plate field/index, and historical overstay timestamp. Apply through the normal migration deployment process; do not use `prisma db push` in production.

## 11. Delivery / Courier Management (P10-F1)
- `Delivery` stores organization-scoped package receipt and pickup lifecycle state (`RECEIVED`, `NOTIFIED`, `COLLECTED`, `RETURNED`, `UNCLAIMED`), recipient/receiver employee relations, courier/AWB details, storage location, optional photo/signature file IDs, and pickup reminder timestamps.
- Pickup codes are never stored in plaintext; only a SHA-256 hash is persisted, and collection is re-verified using constant-time comparison.
- `DeliveryPersonLog` provides a lightweight, policy-controlled courier-person entry without creating a normal visitor check-in.
- Migration: `prisma/migrations/20261123194500_p10_f1_delivery/migration.sql`.

## 12. Contractor Management and Compliance (P10-F2)
- `ContractorCompany` stores company status, contract window, contact details, GSTIN, and sponsor employee. `ContractorWorker` links an organization worker to a visitor identity and adds trade, induction, and work-permit fields.
- `ComplianceRequirement` defines organization-level mandatory document types and validity rules. `Document.visitorId` becomes nullable and is supplemented by nullable `contractorCompanyId` and `contractorWorkerId`, preserving all P3 visitor document flows.
- Sensitive contractor documents reuse `Document`, `File`, storage adapters, antivirus/magic-byte validation, signed URLs, soft delete, and `DOCUMENT_VIEW/DOWNLOAD` plus `COMPLIANCE_DOC_UPLOAD` auditing.

