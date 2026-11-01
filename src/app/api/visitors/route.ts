import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const createVisitorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().min(5, "Phone is required"),
  company: z.string().optional().nullable().or(z.literal("")),
  visitorTypeId: z.string().optional().nullable().or(z.literal("")),
  idProofType: z.string().optional().nullable().or(z.literal("")),
  idProofNumber: z.string().optional().nullable().or(z.literal("")),
  avatarUrl: z.string().optional().nullable().or(z.literal("")),
});

const patchVisitorSchema = z.object({
  id: z.string().min(1, "Visitor ID is required"),
  isBlacklisted: z.boolean().optional().nullable(),
  blacklistReason: z.string().optional().nullable().or(z.literal("")),
  company: z.string().optional().nullable().or(z.literal("")),
  visitorTypeId: z.string().optional().nullable().or(z.literal("")),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("visitors.read");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const typeId = searchParams.get("typeId") || "";

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    if (typeId) {
      where.visitorTypeId = typeId;
    }

    const visitors = await prisma.visitor.findMany({
      where,
      include: {
        visitorType: true,
        checkIns: {
          orderBy: { checkInTime: "desc" },
          take: 1,
          include: {
            hostEmployee: {
              include: { user: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const formatted = visitors.map((v) => {
      const latestCheckIn = v.checkIns[0];
      const isCurrentlyCheckedIn = latestCheckIn && latestCheckIn.status === "CHECKED_IN";

      return {
        id: v.id,
        name: v.name,
        email: v.email,
        phone: v.phone,
        company: v.company,
        avatarUrl: v.avatarUrl,
        idProofType: v.idProofType,
        idProofNumber: v.idProofNumber,
        isBlacklisted: v.isBlacklisted,
        blacklistReason: v.blacklistReason,
        visitorType: v.visitorType,
        latestCheckIn: latestCheckIn
          ? {
              id: latestCheckIn.id,
              status: latestCheckIn.status,
              checkInTime: latestCheckIn.checkInTime,
              badgeNumber: latestCheckIn.badgeNumber,
              hostName: latestCheckIn.hostEmployee.user.name,
            }
          : null,
        isCheckedIn: isCurrentlyCheckedIn,
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error) {
    console.error("Visitors GET Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch visitors" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("visitors.write");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const body = await request.json().catch(() => null);
    const parsed = createVisitorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { name, email, phone, company, visitorTypeId, idProofType, idProofNumber, avatarUrl } = parsed.data;

    // Verify visitorTypeId if supplied
    if (visitorTypeId) {
      const vType = await prisma.visitorType.findFirst({
        where: { id: visitorTypeId, organizationId: orgId },
      });
      if (!vType) {
        return NextResponse.json({ success: false, error: "Invalid visitor type for organization" }, { status: 400 });
      }
    }

    // Check if blacklisted in organization
    const blacklisted = await prisma.blacklistVisitor.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { email: email.toLowerCase().trim() },
          { phone: phone.trim() },
          ...(idProofNumber ? [{ idProofNumber: idProofNumber.trim() }] : []),
        ],
      },
    });

    const visitor = await prisma.visitor.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        company: company?.trim() || null,
        visitorTypeId: visitorTypeId || null,
        idProofType: idProofType || null,
        idProofNumber: idProofNumber?.trim() || null,
        avatarUrl: avatarUrl || null,
        isBlacklisted: Boolean(blacklisted),
        blacklistReason: blacklisted ? blacklisted.reason : null,
        organizationId: orgId,
      },
      include: {
        visitorType: true,
      },
    });

    return NextResponse.json({ success: true, data: visitor, message: "Visitor created successfully" });
  } catch (error) {
    console.error("Create visitor error:", error);
    return NextResponse.json({ success: false, error: "Failed to create visitor" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("visitors.write");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const body = await request.json().catch(() => null);
    const parsed = patchVisitorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { id, isBlacklisted, blacklistReason, company, visitorTypeId, name, phone } = parsed.data;

    // Org-scoped lookup
    const existing = await prisma.visitor.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Visitor not found in organization." }, { status: 404 });
    }

    const updated = await prisma.visitor.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(phone ? { phone: phone.trim() } : {}),
        ...(company !== undefined ? { company: company?.trim() || "Independent Guest" } : {}),
        ...(visitorTypeId !== undefined ? { visitorTypeId: visitorTypeId || null } : {}),
        ...(isBlacklisted !== undefined
          ? {
              isBlacklisted: Boolean(isBlacklisted),
              blacklistReason: isBlacklisted ? blacklistReason || "Flagged by security concierge" : null,
            }
          : {}),
      },
      include: {
        visitorType: true,
      },
    });

    return NextResponse.json({ success: true, data: updated, message: "Visitor updated successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update visitor";
    console.error("Update visitor error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("visitors.delete");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Visitor ID is required" }, { status: 400 });
    }

    const visitor = await prisma.visitor.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!visitor) {
      return NextResponse.json({ success: false, error: "Visitor not found in organization" }, { status: 404 });
    }

    await prisma.visitor.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Visitor record deleted successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete visitor";
    console.error("Delete visitor error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
