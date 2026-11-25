import "server-only";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requiredString } from "@/lib/zod-helpers";
import { authorizeMuster, auditMusterAction, musterErrorResponse } from "../_helpers";

const createSchema = z.object({
  officeId: requiredString("Office is required").pipe(z.string().max(128)),
  name: requiredString("Muster point name is required", 2).pipe(z.string().max(120)),
  location: requiredString("Muster point location is required", 2).pipe(z.string().max(500)),
});

const querySchema = z.object({
  officeId: z.string().trim().min(1).max(128).optional(),
  includeInactive: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: Request) {
  const context = await authorizeMuster(request, "muster.view", "points-read");
  if ("response" in context) return context.response;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid filters" },
      { status: 400 }
    );
  }

  try {
    const points = await prisma.musterPoint.findMany({
      where: {
        organizationId: context.organizationId,
        office: { branch: { organizationId: context.organizationId } },
        ...(parsed.data.officeId ? { officeId: parsed.data.officeId } : {}),
        ...(parsed.data.includeInactive === "true" ? {} : { isActive: true }),
      },
      include: { office: { select: { id: true, name: true, branchId: true } } },
      orderBy: [{ office: { name: "asc" } }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: points });
  } catch (error) {
    return musterErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const context = await authorizeMuster(request, "muster.manage", "point-create", 20);
  if ("response" in context) return context.response;
  const t = await getTranslations("muster");

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid muster point" },
      { status: 400 }
    );
  }

  try {
    const office = await prisma.office.findFirst({
      where: {
        id: parsed.data.officeId,
        branch: { organizationId: context.organizationId },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!office) return NextResponse.json({ success: false, error: t("officeNotFound") }, { status: 404 });

    const point = await prisma.musterPoint.create({
      data: {
        organizationId: context.organizationId,
        officeId: office.id,
        name: parsed.data.name,
        location: parsed.data.location,
      },
    });
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_POINT_CREATED",
      entityId: point.id,
      clientIp: context.clientIp,
    });
    return NextResponse.json({ success: true, data: point }, { status: 201 });
  } catch (error) {
    return musterErrorResponse(error);
  }
}
