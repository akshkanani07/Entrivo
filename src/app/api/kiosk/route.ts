/**
 * /api/kiosk — Admin management of kiosk devices
 * GET  list all kiosks for the org
 * POST create a new kiosk (returns 8-digit single-use pairing code ONCE, 10 min TTL)
 *
 * Requires permission: settings.manage
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requirePermission, requireAnyPermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

import { requiredString } from "@/lib/zod-helpers";

const createKioskSchema = z.object({
  name: requiredString("Kiosk name is required (max 80 characters)").refine(
    (v) => v.length <= 80,
    { message: "Kiosk name must be at most 80 characters" }
  ),
});

export async function GET() {
  try {
    const auth = await requireAnyPermission(["settings.manage", "kiosks.manage"]);
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const kiosks = await prisma.kiosk.findMany({
      where: { organizationId: orgCheck.organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        pairingExpiresAt: true,
        deviceTokenHash: true,
      },
    });

    const now = new Date();
    const safeKiosks = kiosks.map((k) => ({
      id: k.id,
      name: k.name,
      isActive: k.isActive,
      isPaired: Boolean(k.deviceTokenHash && (!k.expiresAt || k.expiresAt > now)),
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      hasPendingPairing: Boolean(k.pairingExpiresAt && k.pairingExpiresAt > now),
    }));

    return NextResponse.json({ success: true, data: safeKiosks });
  } catch (error) {
    console.error("Kiosk GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch kiosks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAnyPermission(["settings.manage", "kiosks.manage"]);
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const body = await request.json().catch(() => null);
    const parsed = createKioskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    // Generate an 8-digit numeric pairing code (10000000 to 99999999)
    const pairingCode = crypto.randomInt(10000000, 99999999).toString();
    const pairingCodeHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
    const pairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

    const kiosk = await prisma.kiosk.create({
      data: {
        organizationId: orgCheck.organizationId,
        name: parsed.data.name.trim(),
        pairingCodeHash,
        pairingExpiresAt,
        isActive: true,
        createdById: auth.user.id,
      },
      select: { id: true, name: true, isActive: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgCheck.organizationId,
        userId: auth.user.id,
        action: "KIOSK_CREATED",
        entity: "Kiosk",
        entityId: kiosk.id,
        details: `Kiosk '${kiosk.name}' created with pairing code`,
      },
    });

    // pairingCode returned ONCE — must be entered on the physical kiosk device
    return NextResponse.json({
      success: true,
      data: {
        ...kiosk,
        pairingCode, // shown once only
        expiresInMinutes: 10,
      },
      message: "Kiosk created. Enter the 8-digit pairing code on the kiosk screen within 10 minutes.",
    });
  } catch (error) {
    console.error("Kiosk POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create kiosk" }, { status: 500 });
  }
}
