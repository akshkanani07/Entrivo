ALTER TYPE "NotificationStatus" ADD VALUE 'OPENED';
ALTER TYPE "NotificationStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "NotificationStatus" ADD VALUE 'SPAM';
ALTER TYPE "NotificationStatus" ADD VALUE 'BLOCKED';

ALTER TABLE "Notification" ADD COLUMN "mailjetMessageId" TEXT;
CREATE UNIQUE INDEX "Notification_mailjetMessageId_key" ON "Notification"("mailjetMessageId");

CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSuppression_organizationId_email_key" ON "EmailSuppression"("organizationId", "email");
CREATE INDEX "EmailSuppression_organizationId_idx" ON "EmailSuppression"("organizationId");
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
