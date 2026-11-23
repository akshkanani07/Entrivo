import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { persistBase64Image } from "@/services/storage/persist-image";
import { verifyPickupCode } from "@/services/deliveries/delivery.service";
import { optionalString } from "@/lib/zod-helpers";

const actionSchema = z.object({
  action: z.enum(["VERIFY", "COLLECT", "RETURN", "UNCLAIMED"]),
  pickupCode: optionalString(),
  collectedByName: optionalString(),
  signatureDataUrl: optionalString(),
  notes: optionalString(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("deliveries.log");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`deliveries-action:${auth.user.id}`, { maxRequests: 240, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many delivery actions." }, { status: 429 });

  const { id } = await context.params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid action." }, { status: 400 });

  const delivery = await prisma.delivery.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!delivery) return NextResponse.json({ success: false, error: "Delivery not found." }, { status: 404 });
  if (delivery.status === "COLLECTED" && parsed.data.action !== "UNCLAIMED") {
    return NextResponse.json({ success: false, error: "Delivery has already been collected." }, { status: 409 });
  }

  if (parsed.data.action === "VERIFY") {
    const valid = verifyPickupCode(parsed.data.pickupCode || "", delivery.pickupCodeHash);
    if (!valid) return NextResponse.json({ success: false, error: "Invalid pickup code." }, { status: 403 });
    return NextResponse.json({ success: true, data: { verified: true } });
  }

  if (parsed.data.action === "COLLECT") {
    const valid = verifyPickupCode(parsed.data.pickupCode || "", delivery.pickupCodeHash);
    if (!valid) return NextResponse.json({ success: false, error: "Invalid pickup code." }, { status: 403 });

    let signatureFileId: string | null = null;
    if (parsed.data.signatureDataUrl) {
      const signatureUrl = await persistBase64Image(parsed.data.signatureDataUrl, organizationId, "SIGNATURE", delivery.id, auth.user.id);
      signatureFileId = signatureUrl?.startsWith("/api/files/") ? signatureUrl.split("/").pop() || null : null;
    }

    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "COLLECTED",
        collectedAt: new Date(),
        collectedByName: parsed.data.collectedByName || null,
        signatureFileId,
        pickupCodeHash: null,
        notes: parsed.data.notes || delivery.notes,
      },
    });
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "DELIVERY_COLLECT",
      entity: "DELIVERY",
      entityId: delivery.id,
      details: {
        delegateName: parsed.data.collectedByName || null,
        signatureCaptured: Boolean(signatureFileId),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  if (parsed.data.action === "RETURN") {
    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: "RETURNED", notes: parsed.data.notes || delivery.notes },
    });
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "DELIVERY_RETURN",
      entity: "DELIVERY",
      entityId: delivery.id,
      details: { notes: parsed.data.notes || null },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  const updated = await prisma.delivery.update({
    where: { id: delivery.id },
    data: { status: "UNCLAIMED", unclaimedAt: new Date(), notes: parsed.data.notes || delivery.notes },
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "DELIVERY_UNCLAIMED",
    entity: "DELIVERY",
    entityId: delivery.id,
  });
  return NextResponse.json({ success: true, data: updated });
}
