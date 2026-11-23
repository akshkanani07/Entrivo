import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";

import { requiredString, optionalString, optionalEmail } from "@/lib/zod-helpers";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { isValidForeignPlateNumber, isValidIndianPlateNumber, normalizePlateNumber } from "@/lib/parking";

const createBlacklistSchema = z.object({
  name: requiredString("Name is required"),
  phone: optionalString(),
  email: optionalEmail("Valid email is required"),
  idProofNumber: optionalString(),
  vehiclePlateNumber: z.string().trim().max(24).optional().default(""),
  foreignPlate: z.boolean().optional().default(false),
  reason: requiredString("Reason is required"),
});

export async function GET() {
  try {
    const auth = await requirePermission("blacklist.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const list = await prisma.blacklistVisitor.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error("Blacklist GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch blacklist" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("blacklist.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const limit = checkRateLimit(`blacklist-add:${auth.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many blacklist changes." }, { status: 429 });

    const body = await request.json().catch(() => null);
    const parsed = createBlacklistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { name, phone, email, idProofNumber, vehiclePlateNumber, foreignPlate, reason } = parsed.data;
    const normalizedPlate = normalizePlateNumber(vehiclePlateNumber);
    if (normalizedPlate && !(foreignPlate
      ? isValidForeignPlateNumber(vehiclePlateNumber)
      : isValidIndianPlateNumber(vehiclePlateNumber))) {
      return NextResponse.json({ success: false, error: "Vehicle plate number is invalid." }, { status: 400 });
    }

    const entry = await prisma.blacklistVisitor.create({
      data: {
        name: name.trim(),
        phone: phone || null,
        email: email ? email.toLowerCase().trim() : null,
        idProofNumber: idProofNumber || null,
        vehiclePlateNumber: normalizedPlate || null,
        reason: reason.trim(),
        organizationId,
      },
    });

    // Also update any matching visitor record in the DB
    if (phone || email) {
      await prisma.visitor.updateMany({
        where: {
          organizationId,
          OR: [
            ...(phone ? [{ phone }] : []),
            ...(email ? [{ email: email.toLowerCase().trim() }] : []),
          ],
        },
        data: {
          isBlacklisted: true,
          blacklistReason: reason.trim(),
        },
      });
    }

    await prisma.securityLog.create({
      data: {
        organizationId,
        logType: "BLACKLIST_ADDED",
        description: normalizedPlate
          ? `Vehicle plate ***${normalizedPlate.slice(-2)} added to security blacklist.`
          : `Visitor ${name} flagged on security blacklist. Reason: ${reason}`,
        severity: "HIGH",
        guardName: auth.user.name || "Security Officer",
      },
    });
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "BLACKLIST_ADDED",
      entity: "BLACKLIST",
      entityId: entry.id,
      details: {
        summary: "Security blacklist entry created.",
        maskedPlate: normalizedPlate ? `***${normalizedPlate.slice(-2)}` : undefined,
      },
    });

    dispatchWebhookEvent(organizationId, "security.alert", {
      alertType: "BLACKLIST_ADDED",
      severity: "HIGH",
      flaggedName: name,
      reason: normalizedPlate ? "Vehicle added to the organization security blacklist." : reason.trim(),
      flaggedBy: auth.user.name || "Security Officer",
    }).catch(console.error);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("Blacklist POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to add to blacklist" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("blacklist.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const limit = checkRateLimit(`blacklist-remove:${auth.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many blacklist changes." }, { status: 429 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Blacklist entry ID is required" }, { status: 400 });
    }

    const existing = await prisma.blacklistVisitor.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Blacklist entry not found" }, { status: 404 });
    }

    await prisma.blacklistVisitor.delete({
      where: { id },
    });

    await prisma.securityLog.create({
      data: {
        organizationId,
        logType: "BLACKLIST_REMOVED",
        description: `Visitor ${existing.name} removed from security blacklist`,
        severity: "MEDIUM",
        guardName: auth.user.name || "Security Officer",
      },
    });
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "BLACKLIST_REMOVED",
      entity: "BLACKLIST",
      entityId: existing.id,
      details: { summary: "Security blacklist entry removed." },
    });

    return NextResponse.json({ success: true, message: "Blacklist entry removed" });
  } catch (error) {
    console.error("Blacklist DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to remove from blacklist" }, { status: 500 });
  }
}
