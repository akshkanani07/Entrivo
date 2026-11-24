import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { can, requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgPolicy } from "@/lib/settings-registry";
import { audit } from "@/services/audit/audit.service";
import { completeSelfCheckin, markSelfCheckinExpired } from "@/services/self-checkin/self-checkin.service";

const decisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

type SessionDraft = { hostEmployeeId?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("selfcheckin.confirm");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const { id } = await context.params;
  const limit = checkRateLimit(`selfcheckin:decision:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid decision." }, { status: 400 });

  const session = await prisma.selfCheckinSession.findFirst({
    where: { id, organizationId: orgCheck.organizationId },
    include: {
      invitation: { include: { hostEmployee: { select: { id: true, userId: true } } } },
      hostEmployee: { select: { id: true, userId: true } },
    },
  });
  if (!session) return NextResponse.json({ success: false, error: "Self check-in session not found." }, { status: 404 });
  if (session.expiresAt.getTime() <= Date.now()) {
    await markSelfCheckinExpired(session);
    return NextResponse.json({ success: false, error: "Self check-in session expired." }, { status: 410 });
  }
  if (session.status !== "AWAITING_CONFIRMATION") {
    return NextResponse.json({ success: false, error: "Self check-in session is no longer awaiting confirmation." }, { status: 409 });
  }

  let draft: SessionDraft = {};
  if (session.payloadCiphertext) {
    try {
      draft = JSON.parse(decrypt(session.payloadCiphertext)) as SessionDraft;
    } catch {
      return NextResponse.json({ success: false, error: "Self check-in session cannot be processed." }, { status: 409 });
    }
  }
  const hostEmployeeId = session.hostEmployeeId || draft.hostEmployeeId || session.invitation?.hostEmployee.id;
  const isHost = Boolean(hostEmployeeId && auth.user.employeeId === hostEmployeeId);
  const isDeskApprover = ["SUPER_ADMIN", "ORG_ADMIN", "RECEPTIONIST", "SECURITY_GUARD"].includes(auth.user.role);
  const { policy } = await getOrgPolicy(orgCheck.organizationId);

  if (policy.selfCheckinMode === "OFF") {
    return NextResponse.json({ success: false, error: "Self check-in is disabled." }, { status: 403 });
  }
  if (policy.selfCheckinMode === "DESK_CONFIRM" && !isDeskApprover) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }
  if (policy.selfCheckinMode !== "DESK_CONFIRM" && !isHost && !isDeskApprover) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }
  if (!can(auth.user, "selfcheckin.confirm")) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const status = parsed.data.action === "APPROVE" ? "CONFIRMED" : "REJECTED";
  const changed = await prisma.selfCheckinSession.updateMany({
    where: {
      id: session.id,
      organizationId: orgCheck.organizationId,
      status: "AWAITING_CONFIRMATION",
      expiresAt: { gt: new Date() },
    },
    data: {
      status,
      confirmedById: parsed.data.action === "APPROVE" ? auth.user.id : null,
      confirmedAt: parsed.data.action === "APPROVE" ? new Date() : null,
      payloadCiphertext: parsed.data.action === "REJECT" ? null : session.payloadCiphertext,
      emailCiphertext: parsed.data.action === "REJECT" ? null : session.emailCiphertext,
    },
  });
  if (!changed.count) return NextResponse.json({ success: false, error: "Self check-in session is no longer awaiting confirmation." }, { status: 409 });

  await audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: parsed.data.action === "APPROVE" ? "SELFCHECKIN_CONFIRMED" : "SELFCHECKIN_REJECTED",
    entity: "SELF_CHECKIN_SESSION",
    entityId: session.id,
  });
  if (parsed.data.action === "REJECT") {
    return NextResponse.json({ success: true, data: { status: "REJECTED" } });
  }

  const completed = await completeSelfCheckin(session.id, {
    userId: auth.user.id,
    name: auth.user.name,
    receptionist: isDeskApprover,
  });
  if (!completed.success) {
    return NextResponse.json({ success: false, error: completed.error }, { status: completed.status });
  }
  return NextResponse.json({
    success: true,
    data: { status: "COMPLETED", badgeNumber: completed.badgeNumber },
  });
}
