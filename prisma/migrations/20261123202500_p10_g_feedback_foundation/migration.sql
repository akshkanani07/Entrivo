CREATE TYPE "FeedbackCategory" AS ENUM ('WAIT_TIME', 'STAFF', 'PROCESS', 'FACILITIES', 'PARKING');
CREATE TYPE "FeedbackChannel" AS ENUM ('EMAIL', 'KIOSK', 'QR', 'GENERIC_QR');
CREATE TYPE "FeedbackSource" AS ENUM ('EMAIL', 'KIOSK', 'QR', 'GENERIC_QR');

ALTER TABLE "Visitor"
  ADD COLUMN "preferredLocale" TEXT NOT NULL DEFAULT 'en-IN';

ALTER TABLE "Employee"
  ADD COLUMN "managerId" TEXT;

ALTER TABLE "CheckIn"
  ADD COLUMN "hostNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "meetingStartedAt" TIMESTAMP(3);

CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");
CREATE INDEX "CheckIn_hostNotifiedAt_idx" ON "CheckIn"("hostNotifiedAt");
CREATE INDEX "CheckIn_meetingStartedAt_idx" ON "CheckIn"("meetingStartedAt");
CREATE INDEX "CheckIn_hostEmployeeId_checkInTime_idx" ON "CheckIn"("hostEmployeeId", "checkInTime");
CREATE INDEX "CheckOut_checkOutTime_idx" ON "CheckOut"("checkOutTime");
CREATE INDEX "CheckOut_durationMinutes_idx" ON "CheckOut"("durationMinutes");
CREATE INDEX "Invitation_organizationId_scheduledDate_status_idx"
  ON "Invitation"("organizationId", "scheduledDate", "status");
CREATE INDEX "Invitation_hostEmployeeId_scheduledDate_idx"
  ON "Invitation"("hostEmployeeId", "scheduledDate");

CREATE TABLE "FeedbackRequest" (
  "id" TEXT NOT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "checkInId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "channelSentVia" "FeedbackChannel",
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackResponse" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "checkInId" TEXT,
  "hostEmployeeId" TEXT,
  "branchId" TEXT,
  "officeId" TEXT,
  "npsScore" INTEGER NOT NULL,
  "csatScore" INTEGER,
  "categories" "FeedbackCategory"[],
  "comment" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'en-IN',
  "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "source" "FeedbackSource" NOT NULL DEFAULT 'EMAIL',
  "ipHash" TEXT,
  "profanityFlagged" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "internalNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeedbackResponse_npsRange" CHECK ("npsScore" >= 0 AND "npsScore" <= 10),
  CONSTRAINT "FeedbackResponse_csatRange" CHECK ("csatScore" IS NULL OR ("csatScore" >= 1 AND "csatScore" <= 5))
);

CREATE UNIQUE INDEX "FeedbackRequest_tokenHash_key" ON "FeedbackRequest"("tokenHash");
CREATE UNIQUE INDEX "FeedbackRequest_checkInId_key" ON "FeedbackRequest"("checkInId");
CREATE INDEX "FeedbackRequest_organizationId_expiresAt_idx" ON "FeedbackRequest"("organizationId", "expiresAt");
CREATE INDEX "FeedbackRequest_organizationId_sentAt_idx" ON "FeedbackRequest"("organizationId", "sentAt");

CREATE INDEX "FeedbackResponse_organizationId_createdAt_idx" ON "FeedbackResponse"("organizationId", "createdAt");
CREATE INDEX "FeedbackResponse_organizationId_npsScore_createdAt_idx" ON "FeedbackResponse"("organizationId", "npsScore", "createdAt");
CREATE INDEX "FeedbackResponse_organizationId_hostEmployeeId_createdAt_idx" ON "FeedbackResponse"("organizationId", "hostEmployeeId", "createdAt");
CREATE INDEX "FeedbackResponse_organizationId_branchId_createdAt_idx" ON "FeedbackResponse"("organizationId", "branchId", "createdAt");
CREATE INDEX "FeedbackResponse_checkInId_idx" ON "FeedbackResponse"("checkInId");
CREATE INDEX "FeedbackResponse_hostEmployeeId_idx" ON "FeedbackResponse"("hostEmployeeId");
CREATE INDEX "FeedbackResponse_reviewedAt_idx" ON "FeedbackResponse"("reviewedAt");
CREATE UNIQUE INDEX "FeedbackResponse_checkInId_key" ON "FeedbackResponse"("checkInId");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedbackRequest"
  ADD CONSTRAINT "FeedbackRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FeedbackRequest_checkInId_fkey"
  FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackResponse"
  ADD CONSTRAINT "FeedbackResponse_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FeedbackResponse_checkInId_fkey"
  FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FeedbackResponse_hostEmployeeId_fkey"
  FOREIGN KEY ("hostEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
