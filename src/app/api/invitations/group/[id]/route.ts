import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAnyPermission, requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { performCheckin } from "@/services/visitors/checkin.service";

const checkinSchema = z.object({
  visitorIds: z.array(z.string().min(1).max(100)).min(1).max(200).optional(),
  checkInAllPreRegistered: z.boolean().optional(),
}).refine((value) => Boolean(value.checkInAllPreRegistered) !== Boolean(value.visitorIds?.length), {
  message: "Choose specific visitors or check in all pre-registered visitors.",
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(["invitations.read.all", "invitations.read.own"]);
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { id } = await context.params;
  const invitation = await prisma.invitation.findFirst({
    where: {
      id,
      organizationId: tenant.organizationId,
      ...(auth.user.role === "EMPLOYEE" ? { hostEmployeeId: auth.user.employeeId || "__none__" } : {}),
    },
    include: {
      hostEmployee: { include: { user: { select: { name: true } } } },
      visitors: {
        where: { invitation: { organizationId: tenant.organizationId } },
        include: {
          visitor: { select: { id: true, name: true, email: true, company: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      preRegistrations: {
        select: { visitorId: true, status: true, completeness: true, tokenExpiresAt: true },
      },
      checkIns: {
        where: { deletedAt: null },
        select: { visitorId: true, badgeNumber: true, status: true },
      },
    },
  });
  if (!invitation) return NextResponse.json({ success: false, error: "Group invitation not found." }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      id: invitation.id,
      status: invitation.status,
      scheduledDate: invitation.scheduledDate,
      startTime: invitation.startTime,
      endTime: invitation.endTime,
      purpose: invitation.purpose,
      hostName: invitation.hostEmployee.user.name,
      visitors: invitation.visitors.map((member) => {
        const preRegistration = invitation.preRegistrations.find((item) => item.visitorId === member.visitorId);
        const checkIn = invitation.checkIns.find((item) => item.visitorId === member.visitorId);
        return {
          id: member.visitorId,
          name: member.visitor.name,
          email: member.visitor.email,
          company: member.visitor.company,
          status: member.status,
          preRegistrationStatus: preRegistration?.status || null,
          preRegistrationCompleteness: preRegistration?.completeness ?? 0,
          preRegistered: Boolean(
            preRegistration &&
            ["SUBMITTED", "APPROVED"].includes(preRegistration.status) &&
            preRegistration.tokenExpiresAt > new Date()
          ),
          badgeNumber: checkIn?.badgeNumber || null,
          checkInStatus: checkIn?.status || null,
        };
      }),
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("checkin.perform");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const parsed = checkinSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid group check-in." }, { status: 400 });
    }
    const { id } = await context.params;
    const invitation = await prisma.invitation.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: {
        id: true,
        visitors: {
          where: { invitation: { organizationId: tenant.organizationId } },
          select: { visitorId: true, status: true },
        },
        preRegistrations: {
          where: {
            organizationId: tenant.organizationId,
            status: { in: ["SUBMITTED", "APPROVED"] },
            tokenExpiresAt: { gt: new Date() },
          },
          select: { visitorId: true },
        },
      },
    });
    if (!invitation) return NextResponse.json({ success: false, error: "Group invitation not found." }, { status: 404 });

    const eligible = parsed.data.checkInAllPreRegistered
      ? invitation.visitors
          .filter((member) =>
            invitation.preRegistrations.some((registration) => registration.visitorId === member.visitorId)
          )
          .map((member) => member.visitorId)
      : parsed.data.visitorIds || [];
    if (!eligible.length) {
      return NextResponse.json({ success: false, error: "No eligible visitors were selected." }, { status: 400 });
    }
    const validIds = new Set(invitation.visitors.map((member) => member.visitorId));
    if (eligible.some((visitorId) => !validIds.has(visitorId))) {
      return NextResponse.json({ success: false, error: "Selected visitor is not part of this invitation." }, { status: 400 });
    }

    const results = [];
    for (const visitorId of eligible) {
      const result = await performCheckin({
        invitationId: invitation.id,
        visitorId,
        organizationId: tenant.organizationId,
        actorName: auth.user.name,
        receptionistName: auth.user.name,
      });
      results.push({
        visitorId,
        success: result.success,
        ...(result.success
          ? { badgeNumber: result.checkIn.badgeNumber, visitor: result.checkIn.visitor }
          : { error: result.error }),
      });
    }
    return NextResponse.json({
      success: results.some((result) => result.success),
      data: results,
    }, { status: results.some((result) => result.success) ? 200 : 400 });
  } catch (error) {
    console.error("Group check-in failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Failed to check in group members." }, { status: 500 });
  }
}
