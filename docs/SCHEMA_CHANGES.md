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



