CREATE TYPE "ContractorCompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');
CREATE TYPE "ContractorWorkerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'BLOCKED');

ALTER TABLE "Document"
  ADD COLUMN "contractorCompanyId" TEXT,
  ADD COLUMN "contractorWorkerId" TEXT;

ALTER TABLE "Document" DROP CONSTRAINT "Document_visitorId_fkey";
ALTER TABLE "Document" ALTER COLUMN "visitorId" DROP NOT NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContractorCompany" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gstin" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "status" "ContractorCompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "contractStart" TIMESTAMP(3),
  "contractEnd" TIMESTAMP(3),
  "sponsorEmployeeId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractorWorker" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "trade" TEXT,
  "status" "ContractorWorkerStatus" NOT NULL DEFAULT 'ACTIVE',
  "inductionRequired" BOOLEAN NOT NULL DEFAULT true,
  "inductionDate" TIMESTAMP(3),
  "inductionValidUntil" TIMESTAMP(3),
  "inductionTrainer" TEXT,
  "permitSite" TEXT,
  "permitValidFrom" TIMESTAMP(3),
  "permitValidUntil" TIMESTAMP(3),
  "permitShiftStart" TEXT,
  "permitShiftEnd" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorWorker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceRequirement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mandatoryForAccess" BOOLEAN NOT NULL DEFAULT true,
  "validityRules" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorCompany_organizationId_name_key" ON "ContractorCompany"("organizationId", "name");
CREATE INDEX "ContractorCompany_organizationId_status_idx" ON "ContractorCompany"("organizationId", "status");
CREATE INDEX "ContractorCompany_sponsorEmployeeId_idx" ON "ContractorCompany"("sponsorEmployeeId");
CREATE INDEX "ContractorCompany_contractEnd_idx" ON "ContractorCompany"("contractEnd");
CREATE UNIQUE INDEX "ContractorWorker_organizationId_visitorId_key" ON "ContractorWorker"("organizationId", "visitorId");
CREATE INDEX "ContractorWorker_organizationId_companyId_status_idx" ON "ContractorWorker"("organizationId", "companyId", "status");
CREATE INDEX "ContractorWorker_permitValidFrom_permitValidUntil_idx" ON "ContractorWorker"("permitValidFrom", "permitValidUntil");
CREATE UNIQUE INDEX "ComplianceRequirement_organizationId_docType_key" ON "ComplianceRequirement"("organizationId", "docType");
CREATE INDEX "ComplianceRequirement_organizationId_isActive_mandatoryFo_idx" ON "ComplianceRequirement"("organizationId", "isActive", "mandatoryForAccess");
CREATE INDEX "Document_contractorCompanyId_idx" ON "Document"("contractorCompanyId");
CREATE INDEX "Document_contractorWorkerId_idx" ON "Document"("contractorWorkerId");

ALTER TABLE "ContractorCompany" ADD CONSTRAINT "ContractorCompany_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorCompany" ADD CONSTRAINT "ContractorCompany_sponsorEmployeeId_fkey"
  FOREIGN KEY ("sponsorEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractorWorker" ADD CONSTRAINT "ContractorWorker_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorWorker" ADD CONSTRAINT "ContractorWorker_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "ContractorCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorWorker" ADD CONSTRAINT "ContractorWorker_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractorCompanyId_fkey"
  FOREIGN KEY ("contractorCompanyId") REFERENCES "ContractorCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractorWorkerId_fkey"
  FOREIGN KEY ("contractorWorkerId") REFERENCES "ContractorWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
