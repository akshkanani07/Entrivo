import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

type SessionDraft = { name?: string; company?: string };

export async function GET() {
  const auth = await requirePermission("selfcheckin.confirm");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const limit = checkRateLimit(`selfcheckin:queue:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });

  const sessions = await prisma.selfCheckinSession.findMany({
    where: {
      organizationId: orgCheck.organizationId,
      status: "AWAITING_CONFIRMATION",
      expiresAt: { gt: new Date() },
      ...(auth.user.role === "EMPLOYEE"
        ? { hostEmployeeId: auth.user.employeeId || "__none__" }
        : {}),
    },
    include: {
      point: { include: { office: { select: { name: true } } } },
      invitation: { include: { hostEmployee: { include: { user: { select: { name: true } } } } } },
      hostEmployee: { include: { user: { select: { name: true } } } },
      visitor: { select: { name: true, company: true } },
    },
    orderBy: { startedAt: "asc" },
    take: 100,
  });

  const data = sessions.map((session) => {
    let draft: SessionDraft = {};
    if (session.payloadCiphertext) {
      try {
        draft = JSON.parse(decrypt(session.payloadCiphertext)) as SessionDraft;
      } catch {
        draft = {};
      }
    }
    return {
      id: session.id,
      method: session.method,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      escalatedAt: session.escalatedAt,
      visitorName: session.visitor?.name || draft.name || "Visitor",
      visitorCompany: session.visitor?.company || draft.company || null,
      hostName: session.hostEmployee?.user.name || session.invitation?.hostEmployee.user.name || "Host",
      officeName: session.point.office.name,
    };
  });

  return NextResponse.json({ success: true, data });
}
