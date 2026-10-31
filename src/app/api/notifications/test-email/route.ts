import { NextResponse } from "next/server";
import { emailService } from "@/services/email/mailjet.service";
import { generateVisitorInvitationEmail } from "@/services/email/email.templates";

export async function POST(request: Request) {
  try {
    const { to } = await request.json();

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "A valid 'to' email address is required." }, { status: 400 });
    }

    const result = await emailService.sendEmail(
      generateVisitorInvitationEmail({
        visitorName: "Test Guest",
        visitorEmail: to,
        hostName: "Marcus Vance",
        companyName: "Entrivo Global",
        date: "Today",
        time: "11:00 AM",
        location: "Boardroom Alpha",
        qrPassUrl: "http://localhost:3000/pass/ENTRIVO-INV-APEX-101",
        purpose: "Mailjet API Transactional Integration Verification",
      })
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  }
}
