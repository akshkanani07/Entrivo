import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";

const createTemplateSchema = z.object({
  action: z.string().optional(),
  channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
  code: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  templateName: z.string().optional(),
  variables: z.string().optional(),
});

const updateTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  templateName: z.string().optional(),
});

export async function GET() {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const [emailTemplates, whatsappTemplates] = await Promise.all([
      prisma.emailTemplate.findMany({
        where: { organizationId },
        orderBy: { code: "asc" },
      }),
      prisma.whatsappTemplate.findMany({
        where: { organizationId },
        orderBy: { templateName: "asc" },
      }),
    ]);

    return NextResponse.json({ success: true, emailTemplates, whatsappTemplates });
  } catch (error: any) {
    console.error("Templates GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { action, channel, code, subject, body: templateBody, templateName, variables } = parsed.data;

    // 1-Click Seed Default Workplace Templates
    if (action === "seed_default") {
      await prisma.whatsappTemplate.upsert({
        where: { id: `wa-inv-${organizationId}` },
        update: {},
        create: {
          id: `wa-inv-${organizationId}`,
          organizationId,
          code: "VISITOR_INVITE",
          templateName: "visitor_arrival_invite",
          language: "en_US",
          body: `Hello {{visitor_name}} 👋\n\nYour visit with *{{host_name}}* at ${auth.user.organizationName || "Entrivo Workplace"} is confirmed.\n\n📅 Date: {{date}}\n⏰ Time: {{time}}\n📍 Location: {{location}}\n\nYour Express Digital QR Entry Pass:\n{{qr_link}}\n\nPlease show this QR code at reception upon arrival.`,
          variables: "visitor_name,host_name,date,time,location,qr_link",
          status: "APPROVED",
        },
      });

      await prisma.whatsappTemplate.upsert({
        where: { id: `wa-host-${organizationId}` },
        update: {},
        create: {
          id: `wa-host-${organizationId}`,
          organizationId,
          code: "HOST_ALERT",
          templateName: "visitor_host_arrived_alert",
          language: "en_US",
          body: `🔔 *Visitor Arrival Alert*\n\nHello {{host_name}}, your visitor *{{visitor_name}}* ({{company}}) has arrived and checked in at reception.\n\nMeeting Location: {{location}}\nAssigned Badge: {{badge_number}}`,
          variables: "host_name,visitor_name,company,location,badge_number",
          status: "APPROVED",
        },
      });

      await prisma.emailTemplate.upsert({
        where: { id: `em-inv-${organizationId}` },
        update: {},
        create: {
          id: `em-inv-${organizationId}`,
          organizationId,
          code: "VISITOR_INVITATION_EMAIL",
          subject: `Your Workplace Visitor Pass for ${auth.user.organizationName || "Campus"} on {{date}}`,
          body: `Hello {{visitor_name}},\n\n{{host_name}} has scheduled a meeting for you at {{location}} on {{date}} at {{time}}.\n\nPurpose: {{purpose}}\n\nPlease use your pre-registered touchless pass for expedited security clearance: {{qr_link}}`,
          variables: "visitor_name,host_name,date,time,location,purpose,qr_link",
          isActive: true,
        },
      });

      await prisma.emailTemplate.upsert({
        where: { id: `em-out-${organizationId}` },
        update: {},
        create: {
          id: `em-out-${organizationId}`,
          organizationId,
          code: "VISITOR_CHECKOUT_EMAIL",
          subject: `Thank you for visiting ${auth.user.organizationName || "Entrivo Workplace"}`,
          body: `Hello {{visitor_name}},\n\nYour checkout from ${auth.user.organizationName || "Entrivo Workplace"} has been logged. We hope your meeting with {{host_name}} was productive!\n\nDuration: {{duration}}.\nHave a safe onward journey!`,
          variables: "visitor_name,host_name,duration",
          isActive: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Default enterprise notification templates initialized!",
      });
    }

    if (!templateBody?.trim()) {
      return NextResponse.json({ success: false, error: "Template body is required" }, { status: 400 });
    }

    if (channel === "WHATSAPP") {
      const created = await prisma.whatsappTemplate.create({
        data: {
          organizationId,
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
          organizationId,
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
    return NextResponse.json({ success: false, error: error.message || "Failed to create template" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { id, channel, subject, body: templateBody, templateName } = parsed.data;

    if (channel === "WHATSAPP") {
      const existing = await prisma.whatsappTemplate.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
      }

      const updated = await prisma.whatsappTemplate.update({
        where: { id },
        data: {
          ...(templateBody ? { body: templateBody } : {}),
          ...(templateName ? { templateName } : {}),
        },
      });
      return NextResponse.json({ success: true, data: updated });
    } else {
      const existing = await prisma.emailTemplate.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
      }

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
    return NextResponse.json({ success: false, error: error.message || "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const channel = searchParams.get("channel");

    if (!id) return NextResponse.json({ success: false, error: "ID required" }, { status: 400 });

    if (channel === "WHATSAPP") {
      const existing = await prisma.whatsappTemplate.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
      }
      await prisma.whatsappTemplate.delete({ where: { id } });
    } else {
      const existing = await prisma.emailTemplate.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
      }
      await prisma.emailTemplate.delete({ where: { id } });
    }

    return NextResponse.json({ success: true, message: "Template deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to delete" }, { status: 500 });
  }
}
