import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";

import { requiredString, optionalString, optionalEmail } from "@/lib/zod-helpers";

const createBlacklistSchema = z.object({
  name: requiredString("Name is required"),
  phone: optionalString(),
  email: optionalEmail("Valid email is required"),
  idProofNumber: optionalString(),
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

    const body = await request.json();
    const parsed = createBlacklistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { name, phone, email, idProofNumber, reason } = parsed.data;

    const entry = await prisma.blacklistVisitor.create({
      data: {
        name: name.trim(),
        phone: phone || null,
        email: email ? email.toLowerCase().trim() : null,
        idProofNumber: idProofNumber || null,
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
        description: `Visitor ${name} flagged on security blacklist. Reason: ${reason}`,
        severity: "HIGH",
        guardName: auth.user.name || "Security Officer",
      },
    });

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

    return NextResponse.json({ success: true, message: "Blacklist entry removed" });
  } catch (error) {
    console.error("Blacklist DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to remove from blacklist" }, { status: 500 });
  }
}
