import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [emailTemplates, whatsappTemplates] = await Promise.all([
      prisma.emailTemplate.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { code: "asc" },
      }),
      prisma.whatsappTemplate.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { templateName: "asc" },
      }),
    ]);

    return NextResponse.json({ success: true, emailTemplates, whatsappTemplates });
  } catch (error: any) {
    console.error("Templates GET error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, channel, code, subject, body: templateBody, templateName, variables } = body;
    const orgId = user.organizationId;

    // 1-Click Seed Default Workplace Templates
    if (action === "seed_default") {
      // 1. WhatsApp Invitation
      await prisma.whatsappTemplate.upsert({
        where: { id: `wa-inv-${orgId}` },
        update: {},
        create: {
          id: `wa-inv-${orgId}`,
          organizationId: orgId,
          code: "VISITOR_INVITE",
          templateName: "visitor_arrival_invite",
          language: "en_US",
          body: `Hello {{visitor_name}} 👋\n\nYour visit with *{{host_name}}* at ${user.organizationName || "Entrivo Workplace"} is confirmed.\n\n📅 Date: {{date}}\n⏰ Time: {{time}}\n📍 Location: {{location}}\n\nYour Express Digital QR Entry Pass:\n{{qr_link}}\n\nPlease show this QR code at reception upon arrival.`,
          variables: "visitor_name,host_name,date,time,location,qr_link",
          status: "APPROVED",
        },
      });

      // 2. WhatsApp Host Alert
      await prisma.whatsappTemplate.upsert({
        where: { id: `wa-host-${orgId}` },
        update: {},
        create: {
          id: `wa-host-${orgId}`,
          organizationId: orgId,
          code: "HOST_ALERT",
          templateName: "visitor_host_arrived_alert",
          language: "en_US",
          body: `🔔 *Visitor Arrival Alert*\n\nHello {{host_name}}, your visitor *{{visitor_name}}* ({{company}}) has arrived and checked in at reception.\n\nMeeting Location: {{location}}\nAssigned Badge: {{badge_number}}`,
          variables: "host_name,visitor_name,company,location,badge_number",
          status: "APPROVED",
        },
      });

      // 3. Email Invitation Template
      await prisma.emailTemplate.upsert({
        where: { id: `em-inv-${orgId}` },
        update: {},
        create: {
          id: `em-inv-${orgId}`,
          organizationId: orgId,
          code: "VISITOR_INVITATION_EMAIL",
          subject: `Your Workplace Visitor Pass for ${user.organizationName || "Campus"} on {{date}}`,
          body: `Hello {{visitor_name}},\n\n{{host_name}} has scheduled a meeting for you at {{location}} on {{date}} at {{time}}.\n\nPurpose: {{purpose}}\n\nPlease use your pre-registered touchless pass for expedited security clearance: {{qr_link}}`,
          variables: "visitor_name,host_name,date,time,location,purpose,qr_link",
          isActive: true,
        },
      });

      // 4. Email Checkout Feedback Template
      await prisma.emailTemplate.upsert({
        where: { id: `em-out-${orgId}` },
        update: {},
        create: {
          id: `em-out-${orgId}`,
          organizationId: orgId,
          code: "VISITOR_CHECKOUT_EMAIL",
          subject: `Thank you for visiting ${user.organizationName || "Entrivo Workplace"}`,
          body: `Hello {{visitor_name}},\n\nYour checkout from ${user.organizationName || "Entrivo Workplace"} has been logged. We hope your meeting with {{host_name}} was productive!\n\nDuration: {{duration}}.\nHave a safe onward journey!`,
          variables: "visitor_name,host_name,duration",
          isActive: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Default enterprise notification templates initialized!",
      });
    }

    if (channel === "WHATSAPP") {
      const created = await prisma.whatsappTemplate.create({
        data: {
          organizationId: orgId,
          code: code || "CUSTOM_WHATSAPP",
          templateName: templateName || "custom_template",
          body: templateBody,
          variables: variables || "visitor_name,host_name,date,time",
          status: "APPROVED",
        },
      });
      return NextResponse.json({ success: true, data: created });
    } else {
      const created = await prisma.emailTemplate.create({
        data: {
          organizationId: orgId,
          code: code || "CUSTOM_EMAIL",
          subject: subject || "Workplace Notification",
          body: templateBody,
          variables: variables || "visitor_name,host_name,date,time",
          isActive: true,
        },
      });
      return NextResponse.json({ success: true, data: created });
    }
  } catch (error: any) {
    console.error("Template create error:", error);
    return NextResponse.json({ error: error.message || "Failed to create template" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, channel, subject, body: templateBody, templateName } = body;

    if (channel === "WHATSAPP") {
      const updated = await prisma.whatsappTemplate.update({
        where: { id },
        data: {
          ...(templateBody ? { body: templateBody } : {}),
          ...(templateName ? { templateName } : {}),
        },
      });
      return NextResponse.json({ success: true, data: updated });
    } else {
      const updated = await prisma.emailTemplate.update({
        where: { id },
        data: {
          ...(templateBody ? { body: templateBody } : {}),
          ...(subject ? { subject } : {}),
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }
  } catch (error: any) {
    console.error("Template update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const channel = searchParams.get("channel");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (channel === "WHATSAPP") {
      await prisma.whatsappTemplate.delete({ where: { id } });
    } else {
      await prisma.emailTemplate.delete({ where: { id } });
    }

    return NextResponse.json({ success: true, message: "Template deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
