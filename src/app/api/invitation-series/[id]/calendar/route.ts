import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { RecurrenceRuleSchema } from "@/services/invitations/recurrence";
import { generateSeriesIcs } from "@/services/email/ics";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("invitations.series.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { id } = await context.params;
  const series = await prisma.invitationSeries.findFirst({
    where: {
      id,
      organizationId: tenant.organizationId,
      ...(auth.user.role === "EMPLOYEE" ? { hostEmployeeId: auth.user.employeeId || "__none__" } : {}),
    },
    include: {
      visitor: { select: { name: true, company: true, email: true } },
      hostEmployee: { include: { user: { select: { name: true, email: true } } } },
      meetingRoom: { select: { name: true } },
      organization: { select: { name: true } },
    },
  });
  if (!series) return NextResponse.json({ success: false, error: "Invitation series not found." }, { status: 404 });

  try {
    const rule = RecurrenceRuleSchema.parse(series.rule);
    const calendar = generateSeriesIcs({
      uid: series.id,
      title: series.visitor
        ? `Visit with ${series.visitor.name}`
        : "Group visitor visit",
      description: series.purpose,
      location: series.meetingRoom?.name || series.organization.name,
      startDate: series.startDate.toISOString().slice(0, 10),
      startTime: series.startTime,
      endTime: series.endTime,
      endDate: series.endDate?.toISOString().slice(0, 10),
      count: series.count,
      timezone: series.timezone,
      rule,
      organizerName: series.hostEmployee.user.name,
      organizerEmail: series.hostEmployee.user.email,
      attendeeName: series.visitor?.name || "Visitors",
      attendeeEmail: series.visitor?.email || series.hostEmployee.user.email,
    });
    return new Response(calendar, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="series-${series.id}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Invitation series calendar generation failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Invitation series recurrence rule is invalid." }, { status: 500 });
  }
}
