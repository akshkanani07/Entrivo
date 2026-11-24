import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { reportQueue } from "@/lib/queue";
import { audit } from "@/services/audit/audit.service";
import { Prisma } from "@prisma/client";

const schema = z.object({
  title: z.string().trim().min(3).max(120).default("Scheduled Visitor Analytics"),
  scheduleCron: z.string().trim().min(9).max(100),
  recipients: z.string().trim().min(3).max(2000),
  parameters: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  const auth = await requirePermission("analytics.export");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid analytics schedule." }, { status: 400 });
  }
  const recipients = parsed.data.recipients
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (recipients.length === 0 || recipients.length > 50) {
    return NextResponse.json({ success: false, error: "Provide between 1 and 50 recipients." }, { status: 400 });
  }
  const emailSchema = z.string().email();
  if (recipients.some((email) => !emailSchema.safeParse(email).success)) {
    return NextResponse.json({ success: false, error: "One or more recipients are invalid." }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      organizationId: orgCheck.organizationId,
      title: parsed.data.title,
      reportType: "FEEDBACK_ANALYTICS",
      dateRange: "SCHEDULED",
      statsJson: "{}",
      parameters: (parsed.data.parameters || {}) as Prisma.InputJsonObject,
      isScheduled: true,
      scheduleCron: parsed.data.scheduleCron,
      recipients: recipients.join(","),
      generatedBy: auth.user.id,
    },
  });
  await reportQueue.add("analytics-scheduled", {
    organizationId: orgCheck.organizationId,
    reportId: report.id,
    forceDispatch: true,
  });

  audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "ANALYTICS_SCHEDULED",
    entity: "REPORT",
    entityId: report.id,
  }).catch(console.error);
  return NextResponse.json({ success: true, data: { id: report.id } });
}
