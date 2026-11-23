CREATE TYPE "DeliveryStatus" AS ENUM ('RECEIVED', 'NOTIFIED', 'COLLECTED', 'RETURNED', 'UNCLAIMED');

CREATE TABLE "Delivery" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recipientEmployeeId" TEXT NOT NULL,
  "courierCompany" TEXT NOT NULL,
  "trackingNumber" TEXT,
  "packageCount" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT,
  "photoFileId" TEXT,
  "receivedById" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
  "storageLocation" TEXT,
  "pickupCodeHash" TEXT,
  "collectedAt" TIMESTAMP(3),
  "collectedByName" TEXT,
  "signatureFileId" TEXT,
  "notes" TEXT,
  "reminder24hSentAt" TIMESTAMP(3),
  "reminder72hSentAt" TIMESTAMP(3),
  "unclaimedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryPersonLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT,
  "company" TEXT NOT NULL,
  "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryPersonLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Delivery_organizationId_status_receivedAt_idx" ON "Delivery"("organizationId", "status", "receivedAt");
CREATE INDEX "Delivery_organizationId_courierCompany_idx" ON "Delivery"("organizationId", "courierCompany");
CREATE INDEX "Delivery_organizationId_recipientEmployeeId_idx" ON "Delivery"("organizationId", "recipientEmployeeId");
CREATE INDEX "Delivery_organizationId_trackingNumber_idx" ON "Delivery"("organizationId", "trackingNumber");
CREATE INDEX "Delivery_receivedAt_idx" ON "Delivery"("receivedAt");
CREATE INDEX "DeliveryPersonLog_organizationId_entryTime_idx" ON "DeliveryPersonLog"("organizationId", "entryTime");
CREATE INDEX "DeliveryPersonLog_organizationId_company_idx" ON "DeliveryPersonLog"("organizationId", "company");

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_recipientEmployeeId_fkey"
  FOREIGN KEY ("recipientEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryPersonLog" ADD CONSTRAINT "DeliveryPersonLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
