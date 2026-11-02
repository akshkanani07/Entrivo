import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { audit } from "@/services/audit/audit.service";

const patchApiKeySchema = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
  rateLimit: z.number().int().min(10).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("apikeys.manage");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const { id } = await params;
    const user = auth.user;

    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "API key not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = patchApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    if (parsed.data.name) updateData.name = parsed.data.name.trim();
    if (parsed.data.scopes) {
      updateData.scopes = parsed.data.scopes.join(",");
      updateData.permissions = parsed.data.scopes.join(",");
    }
    if (parsed.data.rateLimit) updateData.rateLimit = parsed.data.rateLimit;
    if (typeof parsed.data.isActive === "boolean") updateData.isActive = parsed.data.isActive;

    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    audit({
      organizationId,
      userId: user.id,
      action: "API_KEY_UPDATED",
      entity: "API_KEY",
      entityId: id,
      before: existing,
      after: updated,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        prefix: updated.prefix,
        scopes: (updated.scopes || "").split(","),
        rateLimit: updated.rateLimit,
        isActive: updated.isActive,
        expiresAt: updated.expiresAt,
        lastUsedAt: updated.lastUsedAt,
      },
      message: "API key updated successfully",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("apikeys.manage");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const { id } = await params;
    const user = auth.user;

    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "API key not found" }, { status: 404 });
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    audit({
      organizationId,
      userId: user.id,
      action: "API_KEY_REVOKED",
      entity: "API_KEY",
      entityId: id,
      details: { prefix: existing.prefix, name: existing.name },
    }).catch(console.error);

    return NextResponse.json({ success: true, message: "API key permanently revoked" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
