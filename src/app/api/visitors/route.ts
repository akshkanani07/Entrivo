import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const typeId = searchParams.get("typeId") || "";
    const status = searchParams.get("status") || "";

    const where: any = {};
    if (user.organizationId) {
      where.organizationId = user.organizationId;
    }

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
    return NextResponse.json({ error: "Failed to fetch visitors" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, phone, company, visitorTypeId, idProofType, idProofNumber, avatarUrl } = body;

    if (!name || !email || !phone) {
      return NextResponse.json({ error: "Name, email, and phone are required" }, { status: 400 });
    }

    // Check if blacklisted
    const blacklisted = await prisma.blacklistVisitor.findFirst({
      where: {
        organizationId: user.organizationId!,
        OR: [
          { email: email.toLowerCase().trim() },
          { phone: phone.trim() },
          ...(idProofNumber ? [{ idProofNumber: idProofNumber.trim() }] : []),
        ],
      },
    });

    const visitor = await prisma.visitor.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        company,
        visitorTypeId: visitorTypeId || null,
        idProofType,
        idProofNumber,
        avatarUrl,
        isBlacklisted: Boolean(blacklisted),
        blacklistReason: blacklisted ? blacklisted.reason : null,
        organizationId: user.organizationId!,
      },
      include: {
        visitorType: true,
      },
    });

    return NextResponse.json({ success: true, data: visitor });
  } catch (error) {
    console.error("Create visitor error:", error);
    return NextResponse.json({ error: "Failed to create visitor" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, isBlacklisted, blacklistReason } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Visitor ID is required" }, { status: 400 });
    }

    const updated = await prisma.visitor.update({
      where: { id },
      data: {
        isBlacklisted: Boolean(isBlacklisted),
        blacklistReason: isBlacklisted ? blacklistReason || "Flagged by security concierge" : null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Update visitor error:", error);
    return NextResponse.json({ error: error.message || "Failed to update visitor" }, { status: 500 });
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

    if (!id) {
      return NextResponse.json({ error: "Visitor ID is required" }, { status: 400 });
    }

    const visitor = await prisma.visitor.findUnique({
      where: { id },
    });

    if (!visitor || visitor.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Visitor not found" }, { status: 404 });
    }

    await prisma.visitor.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Visitor record deleted successfully" });
  } catch (error: any) {
    console.error("Delete visitor error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete visitor" }, { status: 500 });
  }
}
