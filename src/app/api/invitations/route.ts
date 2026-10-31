import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateVisitorToken } from "@/lib/qr";
import { emailService } from "@/services/email/mailjet.service";
import { generateVisitorInvitationEmail } from "@/services/email/email.templates";
import { whatsappService } from "@/services/whatsapp/whatsapp.service";
import { formatDate } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: any = {};
    if (user.organizationId) {
      where.organizationId = user.organizationId;
    }

    // If logged-in user is an employee, show their hosted invitations, unless admin/receptionist
    if (user.role === "EMPLOYEE" && user.employeeId) {
      where.hostEmployeeId = user.employeeId;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      where.scheduledDate = { gte: startOfDay, lte: endOfDay };
    }

    const invitations = await prisma.invitation.findMany({
      where,
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true } },
        meetingRoom: true,
      },
      orderBy: { scheduledDate: "asc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: invitations });
  } catch (error) {
    console.error("Invitations GET Error:", error);
    return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      visitorName,
      visitorEmail,
      visitorPhone,
      visitorCompany,
      visitorTypeId,
      hostEmployeeId,
      scheduledDate,
      startTime,
      endTime,
      purpose,
      meetingRoomId,
      notes,
    } = body;

    if (!visitorName || !visitorEmail || !visitorPhone || !scheduledDate || !purpose) {
      return NextResponse.json({ error: "Missing required invitation fields" }, { status: 400 });
    }

    const orgId = user.organizationId!;

    // 1. Resolve Host Employee
    let effectiveHostId = hostEmployeeId;
    if (!effectiveHostId && user.employeeId) {
      effectiveHostId = user.employeeId;
    }

    if (!effectiveHostId) {
      // Find an employee in the org
      const anyEmp = await prisma.employee.findFirst({ where: { organizationId: orgId } });
      if (anyEmp) effectiveHostId = anyEmp.id;
    }

    // 2. Find or create visitor
    let visitor = await prisma.visitor.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ email: visitorEmail.toLowerCase().trim() }, { phone: visitorPhone.trim() }],
      },
    });

    if (!visitor) {
      visitor = await prisma.visitor.create({
        data: {
          name: visitorName,
          email: visitorEmail.toLowerCase().trim(),
          phone: visitorPhone.trim(),
          company: visitorCompany || "Guest",
          visitorTypeId: visitorTypeId || null,
          organizationId: orgId,
        },
      });
    }

    // 3. Generate QR token
    const qrToken = generateVisitorToken("INV");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const passUrl = `${appUrl}/pass/${qrToken}`;

    // 4. Create Invitation
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: orgId,
        hostEmployeeId: effectiveHostId,
        visitorId: visitor.id,
        meetingRoomId: meetingRoomId || null,
        scheduledDate: new Date(scheduledDate),
        startTime: startTime || "10:00",
        endTime: endTime || "11:00",
        purpose,
        notes,
        qrToken,
        passUrl,
        status: "APPROVED", // Auto-approved for employee invites
      },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true, office: true } },
        meetingRoom: true,
        organization: true,
      },
    });

    // 5. Send Email Invitation
    const hostName = invitation.hostEmployee.user.name;
    const formattedDate = formatDate(invitation.scheduledDate);
    const location = invitation.meetingRoom?.name || invitation.hostEmployee.office?.name || invitation.organization.name;

    emailService.sendEmail(
      generateVisitorInvitationEmail({
        visitorName: visitor.name,
        visitorEmail: visitor.email,
        hostName,
        companyName: invitation.organization.name,
        date: formattedDate,
        time: `${invitation.startTime} - ${invitation.endTime}`,
        location,
        qrPassUrl: passUrl,
        purpose: invitation.purpose,
      })
    ).catch(console.error);

    // 6. Send WhatsApp Invitation
    whatsappService.sendVisitorInvitation({
      phone: visitor.phone,
      visitorName: visitor.name,
      hostName,
      date: formattedDate,
      time: `${invitation.startTime} - ${invitation.endTime}`,
      location,
      qrPassUrl: passUrl,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      message: "Invitation generated and sent to visitor",
      data: invitation,
    });
  } catch (error) {
    console.error("Create invitation error:", error);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}
