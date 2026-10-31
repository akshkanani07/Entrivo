import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const list = await prisma.blacklistVisitor.findMany({
      where: user.organizationId ? { organizationId: user.organizationId } : {},
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error("Blacklist GET error:", error);
    return NextResponse.json({ error: "Failed to fetch blacklist" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, phone, email, idProofNumber, reason } = await request.json();

    if (!name || !reason) {
      return NextResponse.json({ error: "Name and reason are required" }, { status: 400 });
    }

    const entry = await prisma.blacklistVisitor.create({
      data: {
        name,
        phone: phone || null,
        email: email ? email.toLowerCase().trim() : null,
        idProofNumber: idProofNumber || null,
        reason,
        organizationId: user.organizationId!,
      },
    });

    // Also update any matching visitor record in the DB
    if (phone || email) {
      await prisma.visitor.updateMany({
        where: {
          organizationId: user.organizationId!,
          OR: [
            ...(phone ? [{ phone }] : []),
            ...(email ? [{ email: email.toLowerCase().trim() }] : []),
          ],
        },
        data: {
          isBlacklisted: true,
          blacklistReason: reason,
        },
      });
    }

    await prisma.securityLog.create({
      data: {
        organizationId: user.organizationId!,
        logType: "BLACKLIST_ADDED",
        description: `Visitor ${name} flagged on security blacklist. Reason: ${reason}`,
        severity: "HIGH",
        guardName: user.name,
      },
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("Blacklist POST error:", error);
    return NextResponse.json({ error: "Failed to add to blacklist" }, { status: 500 });
  }
}
