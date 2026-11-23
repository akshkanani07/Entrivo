import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeMuster, auditMusterAction, musterErrorResponse } from "../../_helpers";

const idSchema = z.string().trim().min(1).max(128);
const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  location: z.string().trim().min(2).max(500).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await authorizeMuster(request, "muster.manage", "point-update", 30);
  if ("response" in context) return context.response;
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ success: false, error: "Invalid point ID" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsedBody = patchSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: parsedBody.error.issues[0]?.message ?? "Invalid point update" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.musterPoint.updateMany({
      where: {
        id: parsedId.data,
        organizationId: context.organizationId,
        office: { branch: { organizationId: context.organizationId } },
      },
      data: parsedBody.data,
    });
    if (!result.count) return NextResponse.json({ success: false, error: "Muster point not found" }, { status: 404 });

    const point = await prisma.musterPoint.findFirst({
      where: { id: parsedId.data, organizationId: context.organizationId },
    });
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_POINT_UPDATED",
      entityId: parsedId.data,
      clientIp: context.clientIp,
    });
    return NextResponse.json({ success: true, data: point });
  } catch (error) {
    return musterErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await authorizeMuster(request, "muster.manage", "point-deactivate", 30);
  if ("response" in context) return context.response;
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ success: false, error: "Invalid point ID" }, { status: 400 });

  try {
    const result = await prisma.musterPoint.updateMany({
      where: {
        id: parsedId.data,
        organizationId: context.organizationId,
        office: { branch: { organizationId: context.organizationId } },
      },
      data: { isActive: false },
    });
    if (!result.count) return NextResponse.json({ success: false, error: "Muster point not found" }, { status: 404 });
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_POINT_DEACTIVATED",
      entityId: parsedId.data,
      clientIp: context.clientIp,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return musterErrorResponse(error);
  }
}
