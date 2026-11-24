export type VisitorDocumentExpiryState = "EXPIRED" | "EXPIRING" | "VALID";

const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function getVisitorDocumentExpiryState(
  expiryDate: Date | null,
  now: Date = new Date()
): VisitorDocumentExpiryState {
  if (!expiryDate) return "VALID";
  const expiryTime = expiryDate.getTime();
  if (expiryTime < now.getTime()) return "EXPIRED";
  if (expiryTime < now.getTime() + EXPIRING_WINDOW_MS) return "EXPIRING";
  return "VALID";
}

export function hasVisitorMergeConflicts({
  sourceInvitationIds,
  targetInvitationIds,
  sourcePreRegistrationIds,
  targetPreRegistrationIds,
  sourceVehiclePlates,
  targetVehiclePlates,
  hasSourceContractorWorker,
  hasTargetContractorWorker,
}: {
  sourceInvitationIds: string[];
  targetInvitationIds: string[];
  sourcePreRegistrationIds: string[];
  targetPreRegistrationIds: string[];
  sourceVehiclePlates: string[];
  targetVehiclePlates: string[];
  hasSourceContractorWorker: boolean;
  hasTargetContractorWorker: boolean;
}) {
  const overlaps = (source: string[], target: string[]) => {
    const targetValues = new Set(target);
    return source.some((value) => targetValues.has(value));
  };

  return (
    overlaps(sourceInvitationIds, targetInvitationIds) ||
    overlaps(sourcePreRegistrationIds, targetPreRegistrationIds) ||
    overlaps(sourceVehiclePlates, targetVehiclePlates) ||
    (hasSourceContractorWorker && hasTargetContractorWorker)
  );
}
