import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { getOrgPolicy } from "@/lib/settings-registry";
import { optionalString, requiredString } from "@/lib/zod-helpers";

const schema = z.object({
  name: optionalString(),
  company: requiredString("Delivery company is required"),
});

export async function POST(request: Request) {
  const auth = await requirePermission("deliveries.log");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`delivery-person:${auth.user.id}`, { maxRequests: 240, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many delivery-person entries." }, { status: 429 });

  const { policy } = await getOrgPolicy(organizationId);
  if (policy.deliveryPersonEntryPolicy === "OFF") {
    return NextResponse.json({ success: false, error: "Lightweight delivery-person entry is disabled." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid delivery-person entry." }, { status: 400 });

  const entry = await prisma.deliveryPersonLog.create({
    data: {
      organizationId,
      name: parsed.data.name || null,
      company: parsed.data.company,
      recordedById: auth.user.id,
    },
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "DELIVERY_PERSON_ENTRY",
    entity: "DELIVERY_PERSON",
    entityId: entry.id,
    details: { company: entry.company, nameProvided: Boolean(entry.name) },
  });
  return NextResponse.json({ success: true, data: entry }, { status: 201 });
}
