import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { NotificationChannel } from "@prisma/client";
import { z } from "zod";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import {
  ALLOWED_TEMPLATE_VARIABLES,
  interpolateVariables,
  getSampleVariables,
  buildVariableMap,
} from "@/services/notifications/template-engine";
import { emailService } from "@/services/email/mailjet.service";
import { sendInAppNotification } from "@/services/notifications/channels/inapp";
import { NotificationEvent } from "@/services/notifications/events";

const templateActionSchema = z.object({
  action: optionalString(),
  id: optionalString(),
  event: optionalString(),
  channel: z.nativeEnum(NotificationChannel).optional().nullable(),
  locale: optionalString(),
  status: optionalString(),
  subject: optionalString(),
  body: optionalString(),
  variables: optionalString(),
  isActive: z.boolean().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("templates.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const event = searchParams.get("event") || undefined;
    const channel = searchParams.get("channel") as NotificationChannel | null;
    const locale = searchParams.get("locale") || undefined;
    const status = searchParams.get("status") || undefined;

    const where: Record<string, any> = { organizationId };
    if (event) where.event = event;
    if (channel && Object.values(NotificationChannel).includes(channel)) where.channel = channel;
    if (locale) where.locale = locale;
    if (status) where.status = status;

    const templates = await prisma.notificationTemplate.findMany({
      where,
      include: {
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ event: "asc" }, { channel: "asc" }, { version: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: templates,
      allowedVariables: ALLOWED_TEMPLATE_VARIABLES,
    });
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

    const body = await request.json().catch(() => null);
    const parsed = templateActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { action, id, event, channel, locale: inputLocale, status, subject, body: templateBody, variables } = parsed.data;
    const locale = inputLocale || "en";

    // 1. Live Preview with Sample Data
    if (action === "preview") {
      const targetEvent = (event as NotificationEvent) || NotificationEvent.VISITOR_INVITED;
      const sampleVars = getSampleVariables(targetEvent, auth.user.organizationName || "Entrivo Workplace");
      const previewSubject = subject ? interpolateVariables(subject, sampleVars) : "";
      const previewBody = templateBody ? interpolateVariables(templateBody, sampleVars) : "";

      return NextResponse.json({
        success: true,
        data: {
          subject: previewSubject,
          body: previewBody,
          sampleVariables: sampleVars,
        },
      });
    }

    // 2. Test Send to Current User
    if (action === "test_send") {
      const targetEvent = (event as NotificationEvent) || NotificationEvent.VISITOR_INVITED;
      const sampleVars = getSampleVariables(targetEvent, auth.user.organizationName || "Entrivo Workplace");
      const previewSubject = subject ? interpolateVariables(subject, sampleVars) : `[TEST] ${targetEvent}`;
      const previewBody = templateBody ? interpolateVariables(templateBody, sampleVars) : "Test body";

      if (channel === NotificationChannel.EMAIL) {
        await emailService.sendEmail(
          {
            to: auth.user.email,
            recipientName: auth.user.name,
            subject: `[TEST PREVIEW] ${previewSubject}`,
            htmlContent: `<div style="font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 24px; border-radius: 8px;"><h3 style="color: #6366f1;">Test Template Dispatch</h3><p style="white-space: pre-wrap;">${previewBody}</p></div>`,
            textContent: previewBody,
          },
          auth.user.id,
          organizationId,
          "TEMPLATE_TEST_SEND"
        );
      } else {
        await sendInAppNotification({
          organizationId,
          userId: auth.user.id,
          event: targetEvent,
          title: `[TEST] ${previewSubject}`,
          body: previewBody,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Test notification dispatched successfully to ${auth.user.email}.`,
      });
    }

    // 3. Admin Approval Workflow (DRAFT/PENDING_APPROVAL -> ACTIVE)
    if (action === "approve") {
      if (!id) return NextResponse.json({ success: false, error: "Template ID is required for approval" }, { status: 400 });

      const targetTemplate = await prisma.notificationTemplate.findFirst({
        where: { id, organizationId },
      });

      if (!targetTemplate) {
        return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
      }

      // Archive any prior ACTIVE templates for the exact same event/channel/locale
      await prisma.notificationTemplate.updateMany({
        where: {
          organizationId,
          event: targetTemplate.event,
          channel: targetTemplate.channel,
          locale: targetTemplate.locale,
          status: "ACTIVE",
          id: { not: targetTemplate.id },
        },
        data: {
          status: "ARCHIVED",
          isActive: false,
        },
      });

      // Activate and stamp approval
      const approved = await prisma.notificationTemplate.update({
        where: { id: targetTemplate.id },
        data: {
          status: "ACTIVE",
          isActive: true,
          approvedById: auth.user.id,
          approvedAt: new Date(),
        },
        include: { approvedBy: { select: { id: true, name: true, email: true } } },
      });

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: auth.user.id,
          action: "NOTIFICATION_TEMPLATE_APPROVED",
          entity: "NOTIFICATION_TEMPLATE",
          entityId: approved.id,
          details: `Template #${approved.id} (${approved.event} / ${approved.channel} / ${approved.locale} v${approved.version}) approved into ACTIVE status by ${auth.user.name}.`,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Template approved and set to ACTIVE.",
        data: approved,
      });
    }

    // 4. Submit for Approval
    if (action === "submit_for_approval") {
      if (!id) return NextResponse.json({ success: false, error: "Template ID required" }, { status: 400 });

      const submitted = await prisma.notificationTemplate.update({
        where: { id },
        data: { status: "PENDING_APPROVAL" },
      });

      return NextResponse.json({
        success: true,
        message: "Template submitted for administrative review.",
        data: submitted,
      });
    }

    // 5. 1-Click Seed Default Workplace Templates (Multi-Language)
    if (action === "seed_default") {
      const defaults = [
        {
          event: "VISITOR_INVITED",
          channel: NotificationChannel.EMAIL,
          locale: "en",
          subject: `Workplace Access Pass for ${auth.user.organizationName || "Campus"} on {{date}}`,
          body: `Hello {{visitor_name}},\n\n{{host_name}} has scheduled a visit for you at {{location}} on {{date}} at {{time}}.\n\nPurpose: {{purpose}}\n\nPlease use your pre-registered touchless pass for expedited security clearance:\n{{qr_link}}`,
          variables: "visitor_name,host_name,date,time,location,purpose,qr_link",
        },
        {
          event: "VISITOR_ARRIVED",
          channel: NotificationChannel.EMAIL,
          locale: "en",
          subject: `Visitor Arrival Alert: {{visitor_name}} is at reception`,
          body: `Hello {{host_name}},\n\nYour visitor {{visitor_name}} ({{visitor_company}}) has arrived and checked in at {{location}}.\n\nAssigned Badge: {{badge_number}}\nArrival Time: {{time}}`,
          variables: "host_name,visitor_name,visitor_company,location,badge_number,time",
        },
        {
          event: "CHECKIN_CONFIRMATION",
          channel: NotificationChannel.EMAIL,
          locale: "en",
          subject: `Check-in Confirmed: Welcome to ${auth.user.organizationName || "Entrivo"}`,
          body: `Hello {{visitor_name}},\n\nWelcome to {{company_name}}! You are checked in with host {{host_name}} at {{location}}.\n\nAssigned Badge: #{{badge_number}}\nCheck-in Time: {{time}}`,
          variables: "visitor_name,company_name,host_name,location,badge_number,time",
        },
        {
          event: "VISITOR_CHECKED_OUT",
          channel: NotificationChannel.EMAIL,
          locale: "en",
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
            locale: t.locale,
            status: "ACTIVE",
            version: 1,
            subject: t.subject,
            body: t.body,
            variables: t.variables,
            approvedById: auth.user.id,
            approvedAt: new Date(),
            isActive: true,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: "Default multi-channel templates initialized successfully!",
      });
    }

    // 6. Standard Create Template
    if (!templateBody?.trim()) {
      return NextResponse.json({ success: false, error: "Template body is required" }, { status: 400 });
    }
    if (!event || !channel) {
      return NextResponse.json({ success: false, error: "Event and Channel are required" }, { status: 400 });
    }

    // Calculate version
    const latest = await prisma.notificationTemplate.findFirst({
      where: { organizationId, event, channel, locale },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // By default, admin creating template can set status to ACTIVE or DRAFT
    const initialStatus = status === "ACTIVE" ? "ACTIVE" : "DRAFT";

    if (initialStatus === "ACTIVE") {
      await prisma.notificationTemplate.updateMany({
        where: { organizationId, event, channel, locale, status: "ACTIVE" },
        data: { status: "ARCHIVED", isActive: false },
      });
    }

    const created = await prisma.notificationTemplate.create({
      data: {
        organizationId,
        event,
        channel,
        locale,
        status: initialStatus,
        version: nextVersion,
        subject: subject || null,
        body: templateBody.trim(),
        variables: variables || "visitor_name,host_name,date,time,location",
        approvedById: initialStatus === "ACTIVE" ? auth.user.id : null,
        approvedAt: initialStatus === "ACTIVE" ? new Date() : null,
        isActive: initialStatus === "ACTIVE",
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: auth.user.id,
        action: "NOTIFICATION_TEMPLATE_CREATED",
        entity: "NOTIFICATION_TEMPLATE",
        entityId: created.id,
        details: `Template created for event ${event} on channel ${channel} (${locale} v${nextVersion}, status: ${initialStatus}).`,
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

    const body = await request.json().catch(() => null);
    const parsed = templateActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { id, subject, body: templateBody, variables, status, locale } = parsed.data;
    if (!id) return NextResponse.json({ success: false, error: "Template ID is required" }, { status: 400 });

    const existing = await prisma.notificationTemplate.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    // Editing an active template creates or bumps version in DRAFT until re-approved
    const shouldBumpVersion = existing.status === "ACTIVE";
    const newVersion = shouldBumpVersion ? existing.version + 1 : existing.version;
    const targetStatus = shouldBumpVersion ? "DRAFT" : status || existing.status;

    const updated = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(subject !== undefined ? { subject: subject || null } : {}),
        ...(templateBody ? { body: templateBody.trim() } : {}),
        ...(variables ? { variables } : {}),
        ...(locale ? { locale } : {}),
        version: newVersion,
        status: targetStatus,
        isActive: targetStatus === "ACTIVE",
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: auth.user.id,
        action: "NOTIFICATION_TEMPLATE_UPDATED",
        entity: "NOTIFICATION_TEMPLATE",
        entityId: updated.id,
        details: `Template #${updated.id} updated (version: ${newVersion}, status: ${targetStatus}).`,
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

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: auth.user.id,
        action: "NOTIFICATION_TEMPLATE_DELETED",
        entity: "NOTIFICATION_TEMPLATE",
        entityId: id,
        details: `Template #${id} (${existing.event} / ${existing.channel} / ${existing.locale}) deleted by ${auth.user.name}.`,
      },
    });

    return NextResponse.json({ success: true, message: "Template deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to delete" }, { status: 500 });
  }
}
