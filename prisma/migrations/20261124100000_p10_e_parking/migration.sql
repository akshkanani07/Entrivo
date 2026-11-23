CREATE TYPE "ParkingSlotType" AS ENUM ('CAR', 'BIKE', 'EV', 'ACCESSIBLE', 'RESERVED', 'VIP');
CREATE TYPE "ParkingAssignmentStatus" AS ENUM ('RESERVED', 'OCCUPIED', 'RELEASED', 'NO_SHOW', 'OVERSTAY');
CREATE TYPE "ParkingEventType" AS ENUM ('ENTRY', 'EXIT');
CREATE TYPE "ParkingEventSource" AS ENUM ('MANUAL', 'QR');

ALTER TABLE "Vehicle"
  ADD COLUMN "make" TEXT,
  ADD COLUMN "color" TEXT;

ALTER TABLE "BlacklistVisitor" ADD COLUMN "vehiclePlateNumber" TEXT;
CREATE INDEX "BlacklistVisitor_organizationId_vehiclePlateNumber_idx"
  ON "BlacklistVisitor"("organizationId", "vehiclePlateNumber");
CREATE INDEX "Vehicle_organizationId_plateNumber_idx"
  ON "Vehicle"("organizationId", "plateNumber");

CREATE TABLE "ParkingLot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "officeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParkingLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParkingSlot" (
  "id" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "ParkingSlotType" NOT NULL DEFAULT 'CAR',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParkingSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParkingAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "checkInId" TEXT,
  "invitationId" TEXT,
  "status" "ParkingAssignmentStatus" NOT NULL DEFAULT 'RESERVED',
  "reservedFrom" TIMESTAMP(3) NOT NULL,
  "reservedUntil" TIMESTAMP(3) NOT NULL,
  "enteredAt" TIMESTAMP(3),
  "exitedAt" TIMESTAMP(3),
  "overstayedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParkingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParkingEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "type" "ParkingEventType" NOT NULL,
  "gate" TEXT,
  "recordedById" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" "ParkingEventSource" NOT NULL DEFAULT 'MANUAL',
  CONSTRAINT "ParkingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractorPermit" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "visitorId" TEXT,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorPermit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParkingSlot_lotId_code_key" ON "ParkingSlot"("lotId", "code");
CREATE INDEX "ParkingLot_organizationId_officeId_isActive_idx" ON "ParkingLot"("organizationId", "officeId", "isActive");
CREATE INDEX "ParkingSlot_lotId_type_isActive_idx" ON "ParkingSlot"("lotId", "type", "isActive");
CREATE UNIQUE INDEX "ParkingAssignment_checkInId_key" ON "ParkingAssignment"("checkInId");
CREATE INDEX "ParkingAssignment_organizationId_status_reservedUntil_idx" ON "ParkingAssignment"("organizationId", "status", "reservedUntil");
CREATE INDEX "ParkingAssignment_organizationId_createdAt_idx" ON "ParkingAssignment"("organizationId", "createdAt");
CREATE INDEX "ParkingAssignment_organizationId_enteredAt_idx" ON "ParkingAssignment"("organizationId", "enteredAt");
CREATE INDEX "ParkingAssignment_organizationId_exitedAt_idx" ON "ParkingAssignment"("organizationId", "exitedAt");
CREATE INDEX "ParkingAssignment_organizationId_overstayedAt_idx" ON "ParkingAssignment"("organizationId", "overstayedAt");
CREATE INDEX "ParkingAssignment_slotId_status_reservedFrom_reservedUntil_idx" ON "ParkingAssignment"("slotId", "status", "reservedFrom", "reservedUntil");
CREATE INDEX "ParkingAssignment_vehicleId_status_idx" ON "ParkingAssignment"("vehicleId", "status");
CREATE INDEX "ParkingAssignment_invitationId_idx" ON "ParkingAssignment"("invitationId");
CREATE INDEX "ParkingEvent_organizationId_at_idx" ON "ParkingEvent"("organizationId", "at");
CREATE INDEX "ParkingEvent_vehicleId_at_idx" ON "ParkingEvent"("vehicleId", "at");
CREATE INDEX "ContractorPermit_organizationId_isActive_validFrom_validUntil_idx" ON "ContractorPermit"("organizationId", "isActive", "validFrom", "validUntil");
CREATE INDEX "ContractorPermit_vehicleId_idx" ON "ContractorPermit"("vehicleId");

ALTER TABLE "ParkingLot" ADD CONSTRAINT "ParkingLot_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkingLot" ADD CONSTRAINT "ParkingLot_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkingSlot" ADD CONSTRAINT "ParkingSlot_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "ParkingLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_slotId_fkey"
  FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_checkInId_fkey"
  FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParkingEvent" ADD CONSTRAINT "ParkingEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkingEvent" ADD CONSTRAINT "ParkingEvent_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParkingEvent" ADD CONSTRAINT "ParkingEvent_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractorPermit" ADD CONSTRAINT "ContractorPermit_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorPermit" ADD CONSTRAINT "ContractorPermit_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorPermit" ADD CONSTRAINT "ContractorPermit_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
