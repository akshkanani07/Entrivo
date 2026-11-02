import "server-only";
import { NextResponse } from "next/server";
import { runDataRetentionPurge } from "@/services/privacy/retention.service";
import { requirePermission } from "@/lib/rbac";

function checkCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  return handleRetention(request);
}

export async function POST(request: Request) {
  return handleRetention(request);
}

async function handleRetention(request: Request) {
  try {
    const isCronAuthorized = checkCronAuth(request);
    let orgId: string | undefined;

    if (!isCronAuthorized) {
      // Allow authenticated admins with settings.manage to run manual purge
      const auth = await requirePermission("settings.manage");
      if (auth.response) return auth.response;
      orgId = auth.user.organizationId || undefined;
    } else {
      const { searchParams } = new URL(request.url);
      orgId = searchParams.get("orgId") || undefined;
    }

    const summaries = await runDataRetentionPurge(orgId);

    return NextResponse.json({
      success: true,
      message: "Data retention & DPDP lifecycle purge completed successfully",
      data: summaries,
    });
  } catch (error: any) {
    console.error("Data Retention Cron error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute data retention purge" },
      { status: 500 }
    );
  }
}

