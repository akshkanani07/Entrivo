# Entrivo Schema Changes (Phase 0)

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

# Entrivo Schema Changes (Phase 1)

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

