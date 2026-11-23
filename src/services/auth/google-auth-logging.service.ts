import { prisma } from "@/lib/db";

type GoogleAuthSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface GoogleAuthEvent {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  severity: GoogleAuthSeverity;
}

export async function logGoogleAuthEvent(event: GoogleAuthEvent) {
  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        organizationId: event.organizationId ?? null,
        userId: event.userId ?? null,
        action: event.action,
        entity: "USER",
        entityId: event.userId ?? null,
        details: event.details,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
    }),
    prisma.securityLog.create({
      data: {
        organizationId: event.organizationId ?? null,
        logType: event.action,
        description: event.details,
        severity: event.severity,
      },
    }),
  ]);
}
