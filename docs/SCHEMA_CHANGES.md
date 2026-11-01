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
```
