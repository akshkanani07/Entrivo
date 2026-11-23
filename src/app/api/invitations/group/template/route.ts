import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { groupCsvTemplate } from "@/services/invitations/bulk-csv";

export async function GET() {
  const auth = await requirePermission("invitations.create");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const limit = checkRateLimit(`group-template:${auth.user.id}`, {
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many template requests." }, { status: 429 });
  }
  return new Response(groupCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="entrivo-group-visitors-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
