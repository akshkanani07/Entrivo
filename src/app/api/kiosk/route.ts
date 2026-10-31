/**
 * /api/kiosk — Admin management of kiosk devices
 * GET  list all kiosks for the org
 * POST create a new kiosk (returns raw key ONCE, never again)
 *
 * Requires permission: settings.manage
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const createKioskSchema = z.object({
  name: z.string().min(1, "Kiosk name is required").max(80),
});

export async function GET() {
  try {
    const auth = await requirePermission("settings.manage");
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
        createdAt: true,
        updatedAt: true,
        // keyHash is intentionally excluded — never returned to client
      },
    });

    return NextResponse.json({ success: true, data: kiosks });
  } catch (error) {
    console.error("Kiosk GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch kiosks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("settings.manage");
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

    // Generate a secure 48-character raw key (base64url, no padding)
    const rawKey = crypto.randomBytes(36).toString("base64url"); // 48 chars
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const kiosk = await prisma.kiosk.create({
      data: {
        organizationId: orgCheck.organizationId,
        name: parsed.data.name.trim(),
        keyHash,
        isActive: true,
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
        details: `Kiosk '${kiosk.name}' created`,
      },
    });

    // rawKey returned ONCE — store it securely on the kiosk device
    return NextResponse.json({
      success: true,
      data: {
        ...kiosk,
        rawKey, // shown once only
      },
      message: "Kiosk created. Copy the key now — it will not be shown again.",
    });
  } catch (error) {
    console.error("Kiosk POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create kiosk" },
      { status: 500 }
    );
  }
}

