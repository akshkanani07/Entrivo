import { NextResponse } from "next/server";
import { emailService } from "@/services/email/mailjet.service";
import { generateVisitorInvitationEmail } from "@/services/email/email.templates";
import { requirePermission } from "@/lib/rbac";
import { getAppUrl } from "@/lib/app-url";
import { z } from "zod";

const testEmailSchema = z.object({
  to: z.string().email("A valid email address is required"),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const body = await request.json();
    const parsed = testEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { to } = parsed.data;

    const result = await emailService.sendEmail(
      generateVisitorInvitationEmail({
        visitorName: "Test Guest",
        visitorEmail: to,
        hostName: auth.user.name || "Marcus Vance",
        companyName: auth.user.organizationName || "Entrivo Global",
        date: "Today",
        time: "11:00 AM",
        location: "Boardroom Alpha",
        qrPassUrl: `${getAppUrl()}/pass/ENTRIVO-INV-APEX-101`,
        purpose: "Mailjet API Transactional Integration Verification",
      })
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to send test email" }, { status: 500 });
  }
}
