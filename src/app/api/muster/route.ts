import "server-only";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/rbac-base";
import { prisma } from "@/lib/db";
import { storage } from "@/services/storage";
import { authorizeMuster, auditMusterRead } from "./_helpers";

const querySchema = z.object({
  branchId: z.string().trim().min(1).max(128).optional(),
  officeId: z.string().trim().min(1).max(128).optional(),
  floorId: z.string().trim().min(1).max(128).optional(),
  zoneId: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(120).optional(),
});

function getFileId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/^\/api\/files\/([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  const context = await authorizeMuster(request, "muster.view", "live", 30);
  if ("response" in context) return context.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid filters" },
      { status: 400 }
    );
  }

  const filters = parsed.data;
  try {
    if (filters.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: filters.branchId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!branch) return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });
    }

    if (filters.officeId) {
      const office = await prisma.office.findFirst({
        where: {
          id: filters.officeId,
          branch: { organizationId: context.organizationId },
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
        },
        select: { id: true },
      });
      if (!office) return NextResponse.json({ success: false, error: "Office not found" }, { status: 404 });
    }

    if (filters.floorId) {
      const floor = await prisma.floor.findFirst({
        where: {
          id: filters.floorId,
          office: { branch: { organizationId: context.organizationId } },
          ...(filters.officeId ? { officeId: filters.officeId } : {}),
        },
        select: { id: true },
      });
      if (!floor) return NextResponse.json({ success: false, error: "Floor not found" }, { status: 404 });
    }

    if (filters.zoneId) {
      const zone = await prisma.zone.findFirst({
        where: {
          id: filters.zoneId,
          floor: { office: { branch: { organizationId: context.organizationId } } },
          ...(filters.floorId ? { floorId: filters.floorId } : {}),
        },
        select: { id: true },
      });
      if (!zone) return NextResponse.json({ success: false, error: "Zone not found" }, { status: 404 });
    }

    const searchConditions = filters.search
      ? [
          { visitor: { name: { contains: filters.search, mode: "insensitive" as const } } },
          { visitor: { company: { contains: filters.search, mode: "insensitive" as const } } },
          { hostEmployee: { user: { name: { contains: filters.search, mode: "insensitive" as const } } } },
          { badgeNumber: { contains: filters.search, mode: "insensitive" as const } },
        ]
      : undefined;

    const checkIns = await prisma.checkIn.findMany({
      where: {
        status: "CHECKED_IN",
        visitor: { organizationId: context.organizationId, deletedAt: null },
        hostEmployee: {
          organizationId: context.organizationId,
          user: { organizationId: context.organizationId },
          ...(filters.branchId || filters.officeId
            ? {
                office: {
                  branch: { organizationId: context.organizationId },
                  ...(filters.branchId ? { branchId: filters.branchId } : {}),
                  ...(filters.officeId ? { id: filters.officeId } : {}),
                },
              }
            : {}),
        },
        AND: [
          {
            OR: [
              { floorId: null },
              { floor: { office: { branch: { organizationId: context.organizationId } } } },
            ],
          },
          {
            OR: [
              { zoneId: null },
              { zone: { floor: { office: { branch: { organizationId: context.organizationId } } } } },
            ],
          },
          ...(searchConditions ? [{ OR: searchConditions }] : []),
        ],
        ...(filters.floorId ? { floorId: filters.floorId } : {}),
        ...(filters.zoneId ? { zoneId: filters.zoneId } : {}),
      },
      orderBy: [{ hostEmployee: { office: { name: "asc" } } }, { checkInTime: "asc" }],
      select: {
        id: true,
        badgeNumber: true,
        checkInTime: true,
        updatedAt: true,
        photoUrl: true,
        floorId: true,
        zoneId: true,
        floor: { select: { name: true, number: true, updatedAt: true } },
        zone: { select: { name: true, updatedAt: true } },
        visitor: {
          select: {
            name: true,
            company: true,
            avatarUrl: true,
            updatedAt: true,
            visitorType: { select: { name: true } },
            vehicles: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { plateDisplay: true, createdAt: true },
            },
          },
        },
        hostEmployee: {
          select: {
            phone: true,
            updatedAt: true,
            user: { select: { name: true, updatedAt: true } },
            office: {
              select: {
                id: true,
                name: true,
                updatedAt: true,
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const etagSource = [
      String(Math.floor(Date.now() / 240_000)),
      ...checkIns.map((item) =>
        [
          item.id,
          item.updatedAt.getTime(),
          item.visitor.updatedAt.getTime(),
          item.hostEmployee.updatedAt.getTime(),
          item.hostEmployee.user.updatedAt.getTime(),
          item.hostEmployee.office?.updatedAt.getTime() ?? 0,
          item.floor?.updatedAt.getTime() ?? 0,
          item.zone?.updatedAt.getTime() ?? 0,
          item.visitor.vehicles[0]?.createdAt.getTime() ?? 0,
        ].join(":")
      ),
    ].join("|");
    const etag = `"${createHash("sha256").update(etagSource).digest("hex").slice(0, 24)}"`;
    await auditMusterRead({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_VIEW_LIVE",
      rateLimitResourceId: "live-roster",
      details: { count: checkIns.length },
      clientIp: context.clientIp,
    });

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, no-cache" },
      });
    }

    const photoFileIds = checkIns
      .map((item) => getFileId(item.photoUrl ?? item.visitor.avatarUrl))
      .filter((id): id is string => Boolean(id));
    const files = photoFileIds.length
      ? await prisma.file.findMany({
          where: {
            id: { in: photoFileIds },
            organizationId: context.organizationId,
            deletedAt: null,
          },
          select: { id: true, key: true },
        })
      : [];
    const fileById = new Map(files.map((file) => [file.id, file.key]));
    const rows = await Promise.all(
      checkIns.map(async (item) => {
        const fileId = getFileId(item.photoUrl ?? item.visitor.avatarUrl);
        const photoKey = fileId ? fileById.get(fileId) : undefined;
        return {
          id: item.id,
          name: item.visitor.name,
          company: item.visitor.company,
          host: { name: item.hostEmployee.user.name },
          ...(can(context.user, "employees.read")
            ? { hostPhone: item.hostEmployee.phone }
            : {}),
          badgeNumber: item.badgeNumber,
          checkInTime: item.checkInTime,
          photoUrl: photoKey ? await storage.signedUrl(photoKey, 300) : null,
          vehicle: item.visitor.vehicles[0]?.plateDisplay ?? null,
          office: item.hostEmployee.office,
          floor: item.floorId ? { id: item.floorId, name: item.floor?.name ?? null, number: item.floor?.number ?? null } : null,
          zone: item.zoneId ? { id: item.zoneId, name: item.zone?.name ?? null } : null,
          contractor: item.visitor.visitorType?.name.toLocaleLowerCase().includes("contractor") ?? false,
        };
      })
    );
    const countsByFloor = rows.reduce<Record<string, number>>((counts, row) => {
      const key = row.floor?.id ?? "unassigned";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});

    return NextResponse.json(
      { success: true, data: { entries: rows, countsByFloor, total: rows.length } },
      { headers: { ETag: etag, "Cache-Control": "private, no-cache" } }
    );
  } catch (error) {
    console.error(
      "[Muster API] Live roster query failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { success: false, error: "Failed to load the live muster list." },
      { status: 500 }
    );
  }
}
