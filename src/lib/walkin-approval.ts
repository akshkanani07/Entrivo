import type { WalkinApprovalMode } from "@/lib/settings-schema";

export function walkinRequiresHostApproval(mode: WalkinApprovalMode): boolean {
  return mode !== "AUTO_APPROVE";
}

export function getWalkinEscalationCutoff(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function shouldEscalateWalkinApproval(
  createdAt: Date,
  escalatedAt: Date | null,
  now: Date,
  minutes: number
): boolean {
  return escalatedAt === null && createdAt.getTime() <= getWalkinEscalationCutoff(now, minutes).getTime();
}
