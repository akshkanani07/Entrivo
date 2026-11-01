/**
 * POST /api/kiosk/[id]/repair — Generate a new pairing code for an existing kiosk
 *
 * Permission: settings.manage
 * Generates an 8-digit single-use pairing code with 10-minute TTL, returned ONCE.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requirePermission, requireAnyPermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAnyPermission(["settings.manage", "kiosks.manage"]);
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

    // Generate an 8-digit numeric pairing code (10000000 to 99999999)
    const pairingCode = crypto.randomInt(10000000, 99999999).toString();
    const pairingCodeHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
    const pairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

    await prisma.kiosk.update({
      where: { id: kiosk.id },
      data: {
        pairingCodeHash,
        pairingExpiresAt,
        isActive: true, // Reactivate if previously revoked
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgCheck.organizationId,
        userId: auth.user.id,
        action: "KIOSK_REPAIRED",
        entity: "Kiosk",
        entityId: kiosk.id,
        details: `Re-pairing code generated for kiosk '${kiosk.name}'`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: kiosk.id,
        name: kiosk.name,
        pairingCode,
        expiresInMinutes: 10,
      },
      message: "New pairing code generated. Enter this 8-digit code on the kiosk screen within 10 minutes.",
    });
  } catch (error) {
    console.error("Kiosk re-pair error:", error);
    return NextResponse.json({ success: false, error: "Failed to generate pairing code" }, { status: 500 });
  }
}

