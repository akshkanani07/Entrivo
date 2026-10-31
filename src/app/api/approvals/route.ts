import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const where: any = {};
    if (user.role === "EMPLOYEE" && user.employeeId) {
      where.approverId = user.employeeId;
    }

    const approvals = await prisma.approval.findMany({
      where,
      include: {
        invitation: {
          include: {
            visitor: { include: { visitorType: true } },
            hostEmployee: { include: { user: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: approvals });
  } catch (error) {
    console.error("Approvals GET error:", error);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { approvalId, action, comments } = await request.json();

    if (!approvalId || !["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "Approval ID and valid action (APPROVED/REJECTED) are required" }, { status: 400 });
    }

    const approval = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: action,
        comments,
        approvedAt: new Date(),
      },
      include: {
        invitation: true,
      },
    });

    if (approval.invitationId) {
      await prisma.invitation.update({
        where: { id: approval.invitationId },
        data: {
          status: action === "APPROVED" ? "APPROVED" : "REJECTED",
        },
      });
    }

    return NextResponse.json({ success: true, data: approval });
  } catch (error) {
    console.error("Approval action error:", error);
    return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
  }
}
