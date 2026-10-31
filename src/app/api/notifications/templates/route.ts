import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { NotificationChannel } from "@prisma/client";
import { z } from "zod";

const createTemplateSchema = z.object({
  action: z.string().optional(),
  event: z.string().optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
  subject: z.string().optional().nullable(),
  body: z.string().optional(),
  variables: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  subject: z.string().optional().nullable(),
  body: z.string().optional(),
  variables: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const templates = await prisma.notificationTemplate.findMany({
      where: { organizationId },
      orderBy: [{ event: "asc" }, { channel: "asc" }],
    });

    return NextResponse.json({ success: true, data: templates });
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

    const { action, event, channel, subject, body: templateBody, variables, isActive } = parsed.data;

    // 1-Click Seed Default Workplace Templates
    if (action === "seed_default") {
      const defaults = [
        {
          event: "VISITOR_INVITED",
          channel: NotificationChannel.EMAIL,
          subject: `Workplace Access Pass for ${auth.user.organizationName || "Campus"} on {{date}}`,
          body: `Hello {{visitor_name}},\n\n{{host_name}} has scheduled a visit for you at {{location}} on {{date}} at {{time}}.\n\nPurpose: {{purpose}}\n\nPlease use your pre-registered touchless pass for expedited security clearance:\n{{qr_link}}`,
          variables: "visitor_name,host_name,date,time,location,purpose,qr_link",
        },
        {
          event: "VISITOR_ARRIVED",
          channel: NotificationChannel.EMAIL,
          subject: `Visitor Arrival Alert: {{visitor_name}} is at reception`,
          body: `Hello {{host_name}},\n\nYour visitor {{visitor_name}} ({{company}}) has arrived and checked in at {{location}}.\n\nAssigned Badge: {{badge_number}}\nArrival Time: {{time}}`,
          variables: "host_name,visitor_name,company,location,badge_number,time",
        },
        {
          event: "VISITOR_ARRIVED",
          channel: NotificationChannel.WEB_PUSH,
          subject: "Guest Arrived",
          body: `{{visitor_name}} from {{company}} is waiting at {{location}}.`,
          variables: "visitor_name,company,location",
        },
        {
          event: "VISITOR_ARRIVED",
          channel: NotificationChannel.SLACK,
          subject: null,
          body: `*Visitor Arrival Alert*: {{visitor_name}} ({{company}}) checked in with host *{{host_name}}* at {{location}}. Badge #{{badge_number}}.`,
          variables: "visitor_name,company,host_name,location,badge_number",
        },
        {
          event: "VISITOR_ARRIVED",
          channel: NotificationChannel.TEAMS,
          subject: null,
          body: `Visitor Arrival: {{visitor_name}} ({{company}}) has arrived for host {{host_name}} at {{location}}.`,
          variables: "visitor_name,company,host_name,location",
        },
        {
          event: "VISITOR_CHECKED_OUT",
          channel: NotificationChannel.EMAIL,
          subject: `Thank you for visiting ${auth.user.organizationName || "Entrivo"}`,
          body: `Hello {{visitor_name}},\n\nYour checkout has been logged. We hope your meeting with {{host_name}} was productive!\n\nHave a safe onward journey!`,
          variables: "visitor_name,host_name",
        },
      ];

      for (const t of defaults) {
        await prisma.notificationTemplate.create({
          data: {
            organizationId,
            event: t.event,
            channel: t.channel,
            subject: t.subject,
            body: t.body,
            variables: t.variables,
            isActive: true,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: "Default multi-channel templates initialized successfully!",
      });
    }

    if (!templateBody?.trim()) {
      return NextResponse.json({ success: false, error: "Template body is required" }, { status: 400 });
    }

    if (!event || !channel) {
      return NextResponse.json({ success: false, error: "Event and Channel are required" }, { status: 400 });
    }

    const created = await prisma.notificationTemplate.create({
      data: {
        organizationId,
        event,
        channel,
        subject: subject || null,
        body: templateBody.trim(),
        variables: variables || "visitor_name,host_name,date,time,location",
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({ success: true, data: created });
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

    const { id, subject, body: templateBody, variables, isActive } = parsed.data;

    const existing = await prisma.notificationTemplate.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    const updated = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(subject !== undefined ? { subject } : {}),
        ...(templateBody !== undefined ? { body: templateBody.trim() } : {}),
        ...(variables !== undefined ? { variables } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
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

    if (!id) return NextResponse.json({ success: false, error: "ID required" }, { status: 400 });

    const existing = await prisma.notificationTemplate.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    await prisma.notificationTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Template deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to delete" }, { status: 500 });
  }
}
