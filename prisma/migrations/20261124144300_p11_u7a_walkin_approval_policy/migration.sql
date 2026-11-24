ALTER TABLE "Invitation"
ADD COLUMN "isWalkIn" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Approval"
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "overrideReason" TEXT,
ADD COLUMN "escalatedAt" TIMESTAMP(3);

CREATE INDEX "Invitation_organizationId_status_isWalkIn_idx"
ON "Invitation"("organizationId", "status", "isWalkIn");

CREATE INDEX "Approval_status_escalatedAt_idx"
ON "Approval"("status", "escalatedAt");

ALTER TABLE "Approval"
ADD CONSTRAINT "Approval_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
