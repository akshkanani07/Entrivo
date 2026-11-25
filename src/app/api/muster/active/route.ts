import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";

const bannerEventSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(["REAL", "DRILL"]),
  kind: z.string().min(1).max(64),
  startedAt: z.date(),
});

export async function GET() {
  const auth = await requirePermission("dashboard.view");
  if (auth.response) return auth.response;

  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const limit = checkRateLimit(
    `muster:active-banner:${tenant.organizationId}:${auth.user.id}`,
    { maxRequests: 120, windowMs: 60_000 }
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: "Emergency status is temporarily rate limited." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  try {
    const events = await prisma.emergencyEvent.findMany({
      where: { organizationId: tenant.organizationId, status: "ACTIVE" },
      select: { id: true, type: true, kind: true, startedAt: true },
      orderBy: { startedAt: "desc" },
      take: 5,
    });
    const parsedEvents = z.array(bannerEventSchema).safeParse(events);
    if (!parsedEvents.success) {
      throw new Error("Invalid active emergency banner data.");
    }

    return NextResponse.json(
      { success: true, data: parsedEvents.data },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error(
      "[Muster API] Active banner query failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { success: false, error: "Failed to check active emergency status." },
      { status: 500 }
    );
  }
}
