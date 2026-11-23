CREATE TYPE "PreRegistrationStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
);

CREATE TYPE "VehicleType" AS ENUM ('CAR', 'BIKE', 'EV', 'OTHER');

ALTER TABLE "Visitor" ADD COLUMN "idProofNumberMasked" TEXT;

CREATE TABLE "PreRegistration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder2hSentAt" TIMESTAMP(3),
    "status" "PreRegistrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "consentVersion" TEXT,
    "consentAt" TIMESTAMP(3),
    "draft" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PreRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitorId" TEXT,
    "plateNumber" TEXT NOT NULL,
    "plateDisplay" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreRegistration_invitationId_key" ON "PreRegistration"("invitationId");
CREATE UNIQUE INDEX "PreRegistration_tokenHash_key" ON "PreRegistration"("tokenHash");
CREATE INDEX "PreRegistration_organizationId_idx" ON "PreRegistration"("organizationId");
CREATE INDEX "PreRegistration_status_idx" ON "PreRegistration"("status");
CREATE INDEX "PreRegistration_tokenExpiresAt_idx" ON "PreRegistration"("tokenExpiresAt");

CREATE UNIQUE INDEX "Vehicle_organizationId_plateNumber_visitorId_key"
    ON "Vehicle"("organizationId", "plateNumber", "visitorId");
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");
CREATE INDEX "Vehicle_visitorId_idx" ON "Vehicle"("visitorId");

ALTER TABLE "PreRegistration"
    ADD CONSTRAINT "PreRegistration_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreRegistration"
    ADD CONSTRAINT "PreRegistration_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreRegistration"
    ADD CONSTRAINT "PreRegistration_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreRegistration"
    ADD CONSTRAINT "PreRegistration_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vehicle"
    ADD CONSTRAINT "Vehicle_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vehicle"
    ADD CONSTRAINT "Vehicle_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
