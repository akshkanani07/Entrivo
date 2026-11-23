CREATE TYPE "EmergencyType" AS ENUM ('REAL', 'DRILL');
CREATE TYPE "EmergencyKind" AS ENUM ('FIRE', 'EARTHQUAKE', 'SECURITY', 'MEDICAL', 'OTHER');
CREATE TYPE "EmergencyStatus" AS ENUM ('ACTIVE', 'ALL_CLEAR', 'CLOSED');
CREATE TYPE "MusterSubjectType" AS ENUM ('VISITOR', 'CONTRACTOR', 'EMPLOYEE_OPTIONAL');
CREATE TYPE "MusterAccountStatus" AS ENUM ('UNACCOUNTED', 'SAFE', 'MISSING', 'HOSPITAL');
CREATE TYPE "EmergencyRecipientType" AS ENUM ('USER', 'VISITOR', 'INTEGRATION');
CREATE TYPE "EmergencyDeliveryKind" AS ENUM ('ALERT', 'ALL_CLEAR');
CREATE TYPE "EmergencyDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "CheckIn" ADD COLUMN "floorId" TEXT;
ALTER TABLE "CheckIn" ADD COLUMN "zoneId" TEXT;
ALTER TABLE "CheckOut" ADD COLUMN "emergencyEventId" TEXT;

CREATE TABLE "EmergencyEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "officeId" TEXT,
    "floorId" TEXT,
    "zoneId" TEXT,
    "type" "EmergencyType" NOT NULL,
    "kind" "EmergencyKind" NOT NULL,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "message" TEXT NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmergencyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MusterPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MusterPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MusterAccountEntry" (
    "id" TEXT NOT NULL,
    "emergencyEventId" TEXT NOT NULL,
    "subjectType" "MusterSubjectType" NOT NULL,
    "checkInId" TEXT,
    "status" "MusterAccountStatus" NOT NULL DEFAULT 'UNACCOUNTED',
    "accountedById" TEXT,
    "accountedAt" TIMESTAMP(3),
    "musterPointId" TEXT,
    "note" TEXT,
    "clientEventId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MusterAccountEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MusterAccountAction" (
    "id" TEXT NOT NULL,
    "emergencyEventId" TEXT NOT NULL,
    "musterEntryId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "status" "MusterAccountStatus" NOT NULL,
    "accountedById" TEXT,
    "accountedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "musterPointId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusterAccountAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyDelivery" (
    "id" TEXT NOT NULL,
    "emergencyEventId" TEXT NOT NULL,
    "musterEntryId" TEXT,
    "recipientUserId" TEXT,
    "recipientType" "EmergencyRecipientType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "kind" "EmergencyDeliveryKind" NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "status" "EmergencyDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmergencyDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckIn_status_floorId_zoneId_idx" ON "CheckIn"("status", "floorId", "zoneId");
CREATE INDEX "CheckIn_floorId_idx" ON "CheckIn"("floorId");
CREATE INDEX "CheckIn_zoneId_idx" ON "CheckIn"("zoneId");
CREATE INDEX "EmergencyEvent_organizationId_status_startedAt_idx" ON "EmergencyEvent"("organizationId", "status", "startedAt");
CREATE INDEX "EmergencyEvent_branchId_status_idx" ON "EmergencyEvent"("branchId", "status");
CREATE INDEX "EmergencyEvent_officeId_status_idx" ON "EmergencyEvent"("officeId", "status");
CREATE INDEX "MusterPoint_organizationId_officeId_isActive_idx" ON "MusterPoint"("organizationId", "officeId", "isActive");
CREATE UNIQUE INDEX "MusterAccountEntry_emergencyEventId_checkInId_key" ON "MusterAccountEntry"("emergencyEventId", "checkInId");
CREATE UNIQUE INDEX "MusterAccountEntry_emergencyEventId_clientEventId_key" ON "MusterAccountEntry"("emergencyEventId", "clientEventId");
CREATE INDEX "MusterAccountEntry_emergencyEventId_status_idx" ON "MusterAccountEntry"("emergencyEventId", "status");
CREATE INDEX "MusterAccountEntry_checkInId_idx" ON "MusterAccountEntry"("checkInId");
CREATE UNIQUE INDEX "MusterAccountAction_emergencyEventId_clientEventId_key" ON "MusterAccountAction"("emergencyEventId", "clientEventId");
CREATE INDEX "MusterAccountAction_musterEntryId_accountedAt_idx" ON "MusterAccountAction"("musterEntryId", "accountedAt");
CREATE UNIQUE INDEX "EmergencyDelivery_emergencyEventId_deliveryKey_key" ON "EmergencyDelivery"("emergencyEventId", "deliveryKey");
CREATE INDEX "EmergencyDelivery_emergencyEventId_kind_channel_status_idx" ON "EmergencyDelivery"("emergencyEventId", "kind", "channel", "status");
CREATE INDEX "EmergencyDelivery_musterEntryId_idx" ON "EmergencyDelivery"("musterEntryId");

ALTER TABLE "CheckIn"
    ADD CONSTRAINT "CheckIn_floorId_fkey"
    FOREIGN KEY ("floorId") REFERENCES "Floor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CheckIn"
    ADD CONSTRAINT "CheckIn_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "Zone"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CheckOut_emergencyEventId_idx" ON "CheckOut"("emergencyEventId");
ALTER TABLE "EmergencyEvent"
    ADD CONSTRAINT "EmergencyEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyEvent"
    ADD CONSTRAINT "EmergencyEvent_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyEvent"
    ADD CONSTRAINT "EmergencyEvent_officeId_fkey"
    FOREIGN KEY ("officeId") REFERENCES "Office"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyEvent"
    ADD CONSTRAINT "EmergencyEvent_floorId_fkey"
    FOREIGN KEY ("floorId") REFERENCES "Floor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyEvent"
    ADD CONSTRAINT "EmergencyEvent_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "Zone"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyEvent"
    ADD CONSTRAINT "EmergencyEvent_startedById_fkey"
    FOREIGN KEY ("startedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckOut"
    ADD CONSTRAINT "CheckOut_emergencyEventId_fkey"
    FOREIGN KEY ("emergencyEventId") REFERENCES "EmergencyEvent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MusterPoint"
    ADD CONSTRAINT "MusterPoint_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusterPoint"
    ADD CONSTRAINT "MusterPoint_officeId_fkey"
    FOREIGN KEY ("officeId") REFERENCES "Office"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusterAccountEntry"
    ADD CONSTRAINT "MusterAccountEntry_emergencyEventId_fkey"
    FOREIGN KEY ("emergencyEventId") REFERENCES "EmergencyEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusterAccountEntry"
    ADD CONSTRAINT "MusterAccountEntry_checkInId_fkey"
    FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MusterAccountEntry"
    ADD CONSTRAINT "MusterAccountEntry_accountedById_fkey"
    FOREIGN KEY ("accountedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MusterAccountEntry"
    ADD CONSTRAINT "MusterAccountEntry_musterPointId_fkey"
    FOREIGN KEY ("musterPointId") REFERENCES "MusterPoint"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MusterAccountAction"
    ADD CONSTRAINT "MusterAccountAction_emergencyEventId_fkey"
    FOREIGN KEY ("emergencyEventId") REFERENCES "EmergencyEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusterAccountAction"
    ADD CONSTRAINT "MusterAccountAction_musterEntryId_fkey"
    FOREIGN KEY ("musterEntryId") REFERENCES "MusterAccountEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusterAccountAction"
    ADD CONSTRAINT "MusterAccountAction_accountedById_fkey"
    FOREIGN KEY ("accountedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MusterAccountAction"
    ADD CONSTRAINT "MusterAccountAction_musterPointId_fkey"
    FOREIGN KEY ("musterPointId") REFERENCES "MusterPoint"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyDelivery"
    ADD CONSTRAINT "EmergencyDelivery_emergencyEventId_fkey"
    FOREIGN KEY ("emergencyEventId") REFERENCES "EmergencyEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyDelivery"
    ADD CONSTRAINT "EmergencyDelivery_musterEntryId_fkey"
    FOREIGN KEY ("musterEntryId") REFERENCES "MusterAccountEntry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyDelivery"
    ADD CONSTRAINT "EmergencyDelivery_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
