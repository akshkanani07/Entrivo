import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/rbac-base";
import { prisma } from "@/lib/db";
import { authorizeMuster, auditMusterAction } from "../../_helpers";

const idSchema = z.string().trim().min(1).max(128);

function hideHostPhones<T extends { snapshot: unknown }>(entries: T[], canReadPhone: boolean) {
  if (canReadPhone) return entries;
  return entries.map((entry) => {
    if (!entry.snapshot || typeof entry.snapshot !== "object" || Array.isArray(entry.snapshot)) {
      return entry;
    }
    const snapshot = { ...(entry.snapshot as Record<string, unknown>) };
    delete snapshot.hostPhone;
    return { ...entry, snapshot };
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await authorizeMuster(request, "muster.view", "event-read");
  if ("response" in context) return context.response;
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Invalid emergency event ID" }, { status: 400 });
  }

  try {
    const event = await prisma.emergencyEvent.findFirst({
      where: { id: parsedId.data, organizationId: context.organizationId },
      include: {
        branch: { select: { id: true, name: true } },
        office: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true, number: true } },
        zone: { select: { id: true, name: true } },
        startedBy: { select: { id: true, name: true } },
        entries: {
          include: {
            accountedBy: { select: { id: true, name: true } },
            musterPoint: { select: { id: true, name: true, location: true } },
            actions: {
              orderBy: { accountedAt: "asc" },
              include: { accountedBy: { select: { id: true, name: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { entries: true } },
      },
    });

    if (!event) return NextResponse.json({ success: false, error: "Emergency event not found" }, { status: 404 });

    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_EVENT_VIEWED",
      entityId: event.id,
      clientIp: context.clientIp,
    });
    return NextResponse.json({
      success: true,
      data: {
        ...event,
        entries: hideHostPhones(event.entries, can(context.user, "employees.read")),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "[Muster API] Event detail failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { success: false, error: "Failed to load emergency event." },
      { status: 500 }
    );
  }
}
