import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET() {
  try {
    const auth = await requirePermission("securityLogs.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const logs = await prisma.securityLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("Security Logs GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch security logs" }, { status: 500 });
  }
}
