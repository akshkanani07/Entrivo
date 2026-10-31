/**
 * /api/kiosk/[id] — Revoke a kiosk
 * DELETE  deactivate (soft-revoke)
 *
 * Requires permission: settings.manage
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const { id } = await params;

    const kiosk = await prisma.kiosk.findFirst({
      where: { id, organizationId: orgCheck.organizationId },
    });

    if (!kiosk) {
      return NextResponse.json({ success: false, error: "Kiosk not found" }, { status: 404 });
    }

    await prisma.kiosk.update({
      where: { id: kiosk.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgCheck.organizationId,
        userId: auth.user.id,
        action: "KIOSK_REVOKED",
        entity: "Kiosk",
        entityId: kiosk.id,
        details: `Kiosk '${kiosk.name}' revoked`,
      },
    });

    return NextResponse.json({ success: true, message: "Kiosk revoked successfully" });
  } catch (error) {
    console.error("Kiosk DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to revoke kiosk" }, { status: 500 });
  }
}

