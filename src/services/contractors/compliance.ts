export type ContractorComplianceStatus = "COMPLIANT" | "EXPIRING" | "NON_COMPLIANT";
export type ContractorPolicy = "BLOCK" | "WARN" | "OFF";

export interface ComplianceRequirementInput {
  docType: string;
  mandatoryForAccess: boolean;
  isActive: boolean;
}

export interface ContractorDocumentInput {
  docType: string;
  expiryDate: Date | null;
  deletedAt: Date | null;
  status: string;
}

export function getExpiryWindow(expiryDate: Date | null, now = new Date()): "VALID" | "EXPIRING" | "EXPIRED" {
  if (!expiryDate) return "VALID";
  const diffMs = expiryDate.getTime() - now.getTime();
  if (diffMs < 0) return "EXPIRED";
  if (diffMs <= 30 * 24 * 60 * 60 * 1000) return "EXPIRING";
  return "VALID";
}

export function computeContractorComplianceStatus(
  requirements: ComplianceRequirementInput[],
  documents: ContractorDocumentInput[],
  now = new Date()
): ContractorComplianceStatus {
  let hasExpiring = false;
  for (const requirement of requirements) {
    if (!requirement.isActive) continue;
    const matches = documents.filter(
      (document) =>
        document.deletedAt === null &&
        document.docType === requirement.docType
    );
    if (matches.length === 0) {
      if (requirement.mandatoryForAccess) return "NON_COMPLIANT";
      continue;
    }
    const hasValid = matches.some((document) => getExpiryWindow(document.expiryDate, now) !== "EXPIRED");
    if (!hasValid) {
      if (requirement.mandatoryForAccess) return "NON_COMPLIANT";
      continue;
    }
    if (matches.some((document) => getExpiryWindow(document.expiryDate, now) === "EXPIRING")) {
      hasExpiring = true;
    }
  }
  return hasExpiring ? "EXPIRING" : "COMPLIANT";
}

export function evaluateContractorPolicy(
  policy: ContractorPolicy,
  complianceStatus: ContractorComplianceStatus,
  companyBlocked = false,
  permitValid = true,
  inductionValid = true
): { allowed: boolean; warning: string | null; reason: string | null } {
  if (companyBlocked) {
    return { allowed: false, warning: null, reason: "Contractor company is suspended or blocked." };
  }
  if (!permitValid) {
    return policy === "BLOCK"
      ? { allowed: false, warning: null, reason: "Contractor work permit is outside its valid site/date/shift window." }
      : { allowed: policy !== "OFF", warning: "Contractor work permit is outside its valid site/date/shift window.", reason: null };
  }
  if (!inductionValid) {
    return policy === "BLOCK"
      ? { allowed: false, warning: null, reason: "Required safety induction is missing or expired." }
      : { allowed: policy !== "OFF", warning: "Required safety induction is missing or expired.", reason: null };
  }
  if (complianceStatus === "NON_COMPLIANT") {
    if (policy === "BLOCK") return { allowed: false, warning: null, reason: "Mandatory contractor compliance document is missing or expired." };
    if (policy === "WARN") return { allowed: true, warning: "Mandatory contractor compliance document is missing or expired.", reason: null };
  }
  if (complianceStatus === "EXPIRING" && policy !== "OFF") {
    return { allowed: true, warning: "A mandatory contractor compliance document is expiring within 30 days.", reason: null };
  }
  return { allowed: true, warning: null, reason: null };
}

export function isPermitValidAt(
  permit: { validFrom: Date | null; validUntil: Date | null; shiftStart: string | null; shiftEnd: string | null; site: string | null },
  now = new Date(),
  site?: string
): boolean {
  if (!permit.validFrom || !permit.validUntil) return false;
  if (now < permit.validFrom || now > permit.validUntil) return false;
  if (permit.site && site && permit.site.trim().toLowerCase() !== site.trim().toLowerCase()) return false;
  if (permit.shiftStart && permit.shiftEnd) {
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (hhmm < permit.shiftStart || hhmm > permit.shiftEnd) return false;
  }
  return true;
}
