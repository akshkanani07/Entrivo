CREATE TABLE "VisitorNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Visitor"
ADD COLUMN "isVip" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "VisitorNote_organizationId_visitorId_createdAt_idx"
ON "VisitorNote"("organizationId", "visitorId", "createdAt");

CREATE INDEX "VisitorNote_authorUserId_idx"
ON "VisitorNote"("authorUserId");

ALTER TABLE "VisitorNote"
ADD CONSTRAINT "VisitorNote_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisitorNote"
ADD CONSTRAINT "VisitorNote_visitorId_fkey"
FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisitorNote"
ADD CONSTRAINT "VisitorNote_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
