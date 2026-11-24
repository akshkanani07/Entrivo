import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const blacklistSchema = z.object({
  isBlacklisted: z.boolean(),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.isBlacklisted && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A reason is required to blacklist a visitor.",
    });
  }
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("blacklist.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const limit = checkRateLimit(`visitor-blacklist:${auth.user.id}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many blacklist changes." }, { status: 429 });
  }

  const parsed = blacklistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Invalid blacklist update." },
      { status: 400 }
    );
  }

  const parsedId = z.string().trim().min(1).max(100).safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Visitor ID is invalid." }, { status: 400 });
  }
  const id = parsedId.data;
  const existing = await prisma.visitor.findFirst({
    where: { id, organizationId: tenant.organizationId, deletedAt: null },
    select: { id: true, isBlacklisted: true, blacklistReason: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Visitor not found." }, { status: 404 });
  }

  const updated = await prisma.visitor.updateMany({
    where: { id: existing.id, organizationId: tenant.organizationId, deletedAt: null },
    data: {
      isBlacklisted: parsed.data.isBlacklisted,
      blacklistReason: parsed.data.isBlacklisted ? parsed.data.reason!.trim() : null,
    },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ success: false, error: "Visitor blacklist status was not updated." }, { status: 409 });
  }

  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: parsed.data.isBlacklisted ? "BLACKLIST_ADDED" : "BLACKLIST_REMOVED",
    entity: "VISITOR",
    entityId: existing.id,
    details: {
      reason: parsed.data.isBlacklisted ? parsed.data.reason!.trim() : existing.blacklistReason,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: existing.id,
      isBlacklisted: parsed.data.isBlacklisted,
      blacklistReason: parsed.data.isBlacklisted ? parsed.data.reason!.trim() : null,
    },
  });
}
