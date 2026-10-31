import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logs = await prisma.securityLog.findMany({
      where: user.organizationId ? { organizationId: user.organizationId } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("Security Logs GET error:", error);
    return NextResponse.json({ error: "Failed to fetch security logs" }, { status: 500 });
  }
}
