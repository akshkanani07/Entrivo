CREATE TYPE "InvitationVisitorStatus" AS ENUM (
    'INVITED',
    'PREREGISTERED',
    'CHECKED_IN',
    'NO_SHOW',
    'CANCELLED'
);

CREATE TYPE "InvitationSeriesStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

CREATE TYPE "BulkImportJobStatus" AS ENUM (
    'PREVIEW',
    'CONFIRMED',
    'PROCESSING',
    'DONE',
    'FAILED'
);

ALTER TABLE "Visitor"
    ADD COLUMN "isRegularVendor" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invitation"
    ADD COLUMN "seriesId" TEXT,
    ADD COLUMN "occurrenceDate" TIMESTAMP(3),
    ADD COLUMN "isException" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Invitation_seriesId_occurrenceDate_key"
    ON "Invitation"("seriesId", "occurrenceDate");
CREATE INDEX "Invitation_seriesId_idx" ON "Invitation"("seriesId");

CREATE TABLE "InvitationVisitor" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" "InvitationVisitorStatus" NOT NULL DEFAULT 'INVITED',
    "qrToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvitationVisitor_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InvitationVisitor" ("id", "invitationId", "visitorId", "status", "qrToken")
SELECT
    'iv_' || i."id",
    i."id",
    i."visitorId",
    CASE
        WHEN EXISTS (
            SELECT 1 FROM "CheckIn" c
            WHERE c."invitationId" = i."id"
        ) THEN 'CHECKED_IN'::"InvitationVisitorStatus"
        WHEN EXISTS (
            SELECT 1 FROM "PreRegistration" p
            WHERE p."invitationId" = i."id"
              AND p."status" IN ('SUBMITTED', 'APPROVED')
        ) THEN 'PREREGISTERED'::"InvitationVisitorStatus"
        WHEN i."status" IN ('CANCELLED', 'REJECTED', 'EXPIRED')
            THEN 'CANCELLED'::"InvitationVisitorStatus"
        ELSE 'INVITED'::"InvitationVisitorStatus"
    END,
    i."qrToken"
FROM "Invitation" i;

CREATE UNIQUE INDEX "InvitationVisitor_qrToken_key"
    ON "InvitationVisitor"("qrToken");
CREATE UNIQUE INDEX "InvitationVisitor_invitationId_visitorId_key"
    ON "InvitationVisitor"("invitationId", "visitorId");
CREATE INDEX "InvitationVisitor_visitorId_idx"
    ON "InvitationVisitor"("visitorId");
CREATE INDEX "InvitationVisitor_invitationId_status_idx"
    ON "InvitationVisitor"("invitationId", "status");

CREATE TABLE "InvitationSeries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostEmployeeId" TEXT NOT NULL,
    "visitorId" TEXT,
    "groupDefinition" JSONB,
    "rule" JSONB NOT NULL,
    "purpose" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "count" INTEGER,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "meetingRoomId" TEXT,
    "timezone" TEXT NOT NULL,
    "skipHolidays" BOOLEAN NOT NULL DEFAULT false,
    "status" "InvitationSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "generatedUntil" TIMESTAMP(3),
    "preApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvitationSeries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvitationSeries_organizationId_status_idx"
    ON "InvitationSeries"("organizationId", "status");
CREATE INDEX "InvitationSeries_hostEmployeeId_idx"
    ON "InvitationSeries"("hostEmployeeId");

CREATE TABLE "BulkImportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "hostEmployeeId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" "BulkImportJobStatus" NOT NULL DEFAULT 'PREVIEW',
    "errorReportFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BulkImportJob_organizationId_status_idx"
    ON "BulkImportJob"("organizationId", "status");
CREATE INDEX "BulkImportJob_createdById_idx"
    ON "BulkImportJob"("createdById");

DROP INDEX "PreRegistration_invitationId_key";
CREATE UNIQUE INDEX "PreRegistration_invitationId_visitorId_key"
    ON "PreRegistration"("invitationId", "visitorId");

ALTER TABLE "InvitationVisitor"
    ADD CONSTRAINT "InvitationVisitor_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvitationVisitor"
    ADD CONSTRAINT "InvitationVisitor_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvitationSeries"
    ADD CONSTRAINT "InvitationSeries_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvitationSeries"
    ADD CONSTRAINT "InvitationSeries_hostEmployeeId_fkey"
    FOREIGN KEY ("hostEmployeeId") REFERENCES "Employee"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvitationSeries"
    ADD CONSTRAINT "InvitationSeries_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvitationSeries"
    ADD CONSTRAINT "InvitationSeries_meetingRoomId_fkey"
    FOREIGN KEY ("meetingRoomId") REFERENCES "MeetingRoom"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvitationSeries"
    ADD CONSTRAINT "InvitationSeries_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvitationSeries"
    ADD CONSTRAINT "InvitationSeries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation"
    ADD CONSTRAINT "Invitation_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "InvitationSeries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BulkImportJob"
    ADD CONSTRAINT "BulkImportJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkImportJob"
    ADD CONSTRAINT "BulkImportJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkImportJob"
    ADD CONSTRAINT "BulkImportJob_hostEmployeeId_fkey"
    FOREIGN KEY ("hostEmployeeId") REFERENCES "Employee"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkImportJob"
    ADD CONSTRAINT "BulkImportJob_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "File"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkImportJob"
    ADD CONSTRAINT "BulkImportJob_errorReportFileId_fkey"
    FOREIGN KEY ("errorReportFileId") REFERENCES "File"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
