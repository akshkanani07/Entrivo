import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireAnyPermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { persistBase64Image } from "@/services/storage/persist-image";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { generatePickupCode, hashPickupCode } from "@/services/deliveries/delivery.service";
import { requiredString, optionalString } from "@/lib/zod-helpers";

const receiveSchema = z.object({
  recipientEmployeeId: requiredString("Recipient employee is required"),
  courierCompany: requiredString("Courier company is required"),
  trackingNumber: optionalString(),
  packageCount: z.coerce.number().int().min(1).max(100).default(1),
  description: optionalString(),
  photoDataUrl: optionalString(),
  storageLocation: optionalString(),
  notes: optionalString(),
});

export async function GET(request: Request) {
  const auth = await requireAnyPermission(["deliveries.read.all", "deliveries.read.own"]);
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const courier = searchParams.get("courier");
  const recipientEmployeeId = searchParams.get("recipientEmployeeId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const ownOnly = searchParams.get("own") === "true";

  const canReadAll = auth.user.role === "SUPER_ADMIN" || auth.user.role === "ORG_ADMIN" ||
    auth.user.role === "RECEPTIONIST" || auth.user.role === "SECURITY_GUARD";
  let employeeId: string | null = null;
  if (ownOnly || !canReadAll) {
    const employee = await prisma.employee.findFirst({
      where: { organizationId, userId: auth.user.id },
      select: { id: true },
    });
    employeeId = employee?.id || "NEVER_MATCH";
  }

  const deliveries = await prisma.delivery.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(status && status !== "ALL" ? { status: status as "RECEIVED" | "NOTIFIED" | "COLLECTED" | "RETURNED" | "UNCLAIMED" } : {}),
      ...(courier ? { courierCompany: { contains: courier, mode: "insensitive" } } : {}),
      ...(recipientEmployeeId ? { recipientEmployeeId } : {}),
      ...(employeeId ? { recipientEmployeeId: employeeId } : {}),
      ...((startDate || endDate) ? {
        receivedAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
        },
      } : {}),
    },
    include: {
      recipientEmployee: { include: { user: { select: { id: true, name: true, email: true } } } },
      receivedBy: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { receivedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ success: true, data: deliveries });
}

export async function POST(request: Request) {
  const auth = await requirePermission("deliveries.log");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`deliveries-receive:${auth.user.id}`, { maxRequests: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many delivery receptions." }, { status: 429 });

  const parsed = receiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid delivery." }, { status: 400 });
  }

  const receivedBy = await prisma.employee.findFirst({
    where: { organizationId, userId: auth.user.id },
    select: { id: true },
  });
  if (!receivedBy) return NextResponse.json({ success: false, error: "Reception employee record not found." }, { status: 403 });

  const recipient = await prisma.employee.findFirst({
    where: { id: parsed.data.recipientEmployeeId, organizationId, deletedAt: null },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!recipient) return NextResponse.json({ success: false, error: "Recipient not found in organization." }, { status: 404 });

  let photoFileId: string | null = null;
  if (parsed.data.photoDataUrl) {
    const photoUrl = await persistBase64Image(parsed.data.photoDataUrl, organizationId, "VISITOR_PHOTO", recipient.id, auth.user.id);
    photoFileId = photoUrl?.startsWith("/api/files/") ? photoUrl.split("/").pop() || null : null;
  }

  const pickupCode = generatePickupCode();
  const delivery = await prisma.delivery.create({
    data: {
      organizationId,
      recipientEmployeeId: recipient.id,
      courierCompany: parsed.data.courierCompany,
      trackingNumber: parsed.data.trackingNumber || null,
      packageCount: parsed.data.packageCount,
      description: parsed.data.description || null,
      photoFileId,
      receivedById: receivedBy.id,
      storageLocation: parsed.data.storageLocation || null,
      pickupCodeHash: hashPickupCode(pickupCode),
      status: "RECEIVED",
      notes: parsed.data.notes || null,
    },
  });

  await notify(NotificationEvent.DELIVERY_RECEIVED, {
    organizationId,
    visitorName: recipient.user.name,
    visitorEmail: recipient.user.email,
    hostName: "Reception",
    hostEmail: recipient.user.email,
    hostUserId: recipient.user.id,
    courierCompany: delivery.courierCompany,
    trackingNumber: delivery.trackingNumber || undefined,
    pickupCode,
    storageLocation: delivery.storageLocation || "Reception",
    packageCount: delivery.packageCount,
    entityId: `delivery-received-${delivery.id}`,
  });

  await audit({
    organizationId,
    userId: auth.user.id,
    action: "DELIVERY_RECEIVE",
    entity: "DELIVERY",
    entityId: delivery.id,
    details: {
      courierCompany: delivery.courierCompany,
      packageCount: delivery.packageCount,
      recipientEmployeeId: recipient.id,
      trackingNumber: delivery.trackingNumber ? crypto.createHash("sha256").update(delivery.trackingNumber).digest("hex").slice(0, 12) : null,
    },
  });

  return NextResponse.json({
    success: true,
    data: delivery,
    pickupCode,
  }, { status: 201 });
}
