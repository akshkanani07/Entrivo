CREATE TYPE "SelfCheckinPointStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "SelfCheckinStatus" AS ENUM (
  'STARTED',
  'IDENTIFIED',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'COMPLETED'
);
CREATE TYPE "SelfCheckinMethod" AS ENUM ('PREREG_QR', 'EMAIL_OTP', 'WALKIN');

CREATE TABLE "SelfCheckinPoint" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "officeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "SelfCheckinPointStatus" NOT NULL DEFAULT 'ACTIVE',
  "secretVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelfCheckinPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SelfCheckinSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pointId" TEXT NOT NULL,
  "invitationId" TEXT,
  "visitorId" TEXT,
  "hostEmployeeId" TEXT,
  "checkInId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "status" "SelfCheckinStatus" NOT NULL DEFAULT 'STARTED',
  "method" "SelfCheckinMethod" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "emailHash" TEXT,
  "emailCiphertext" TEXT,
  "emailOtpHash" TEXT,
  "emailOtpExpiresAt" TIMESTAMP(3),
  "emailOtpAttempts" INTEGER NOT NULL DEFAULT 0,
  "emailVerifiedAt" TIMESTAMP(3),
  "payloadCiphertext" TEXT,
  "idempotencyKeyHash" TEXT,
  "completionClaimedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelfCheckinSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SelfCheckinSession_tokenHash_key" ON "SelfCheckinSession"("tokenHash");
CREATE UNIQUE INDEX "SelfCheckinSession_checkInId_key" ON "SelfCheckinSession"("checkInId");
CREATE UNIQUE INDEX "SelfCheckinSession_idempotencyKeyHash_key" ON "SelfCheckinSession"("idempotencyKeyHash");
CREATE INDEX "SelfCheckinPoint_organizationId_status_idx" ON "SelfCheckinPoint"("organizationId", "status");
CREATE INDEX "SelfCheckinPoint_officeId_idx" ON "SelfCheckinPoint"("officeId");
CREATE INDEX "SelfCheckinSession_organizationId_status_startedAt_idx" ON "SelfCheckinSession"("organizationId", "status", "startedAt");
CREATE INDEX "SelfCheckinSession_pointId_status_idx" ON "SelfCheckinSession"("pointId", "status");
CREATE INDEX "SelfCheckinSession_hostEmployeeId_status_idx" ON "SelfCheckinSession"("hostEmployeeId", "status");
CREATE INDEX "SelfCheckinSession_expiresAt_status_idx" ON "SelfCheckinSession"("expiresAt", "status");

ALTER TABLE "SelfCheckinPoint"
  ADD CONSTRAINT "SelfCheckinPoint_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinPoint_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SelfCheckinSession"
  ADD CONSTRAINT "SelfCheckinSession_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinSession_pointId_fkey"
  FOREIGN KEY ("pointId") REFERENCES "SelfCheckinPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinSession_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinSession_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinSession_hostEmployeeId_fkey"
  FOREIGN KEY ("hostEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinSession_checkInId_fkey"
  FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SelfCheckinSession_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
