import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { getClientIp } from "@/lib/auth";
import { testEmailRateLimiter } from "@/lib/rate-limit";
import { requiredEmail } from "@/lib/zod-helpers";
import { prisma } from "@/lib/db";
import { emailService } from "@/services/email/mailjet.service";
import {
  buildEmailTemplateSamples,
  EMAIL_TEMPLATE_NAMES,
} from "@/services/email/email.templates";

const testEmailSchema = z.object({
  to: requiredEmail("A valid email address is required"),
  template: z.enum(EMAIL_TEMPLATE_NAMES).default("visitor-invitation"),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;

    const rateLimit = testEmailRateLimiter(`${org.organizationId}:${getClientIp(request.headers)}`);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Test email rate limit exceeded." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = testEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { to, template } = parsed.data;
    const samples = buildEmailTemplateSamples(to, auth.user.organizationName || "Entrivo Workplace");
    const result = await emailService.sendEmail(
      samples[template],
      auth.user.id,
      org.organizationId,
      `EMAIL_TEMPLATE_TEST:${template}`
    );

    await prisma.auditLog.create({
      data: {
        organizationId: org.organizationId,
        userId: auth.user.id,
        action: "EMAIL_TEMPLATE_TEST_SENT",
        entity: "NOTIFICATION",
        details: `Test email template ${template} ${result.success ? "queued" : "failed"}.`,
      },
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Email delivery failed." }, { status: 502 });
    }
    return NextResponse.json({ success: true, result, template });
  } catch (error) {
    console.error("[TestEmail] Failed to send test email:", error);
    return NextResponse.json({ success: false, error: "Failed to send test email" }, { status: 500 });
  }
}
