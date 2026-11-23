import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { getClientIp } from "@/lib/auth";

const listSchema = z.object({
  cursor: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  scoreBand: z.enum(["PROMOTER", "PASSIVE", "DETRACTOR", "ALL"]).default("ALL"),
  hostEmployeeId: z.string().trim().max(64).optional(),
  branchId: z.string().trim().max(64).optional(),
  reviewed: z.enum(["ALL", "REVIEWED", "UNREVIEWED"]).default("ALL"),
});

const updateSchema = z.object({
  id: z.string().trim().min(1).max(64),
  reviewed: z.boolean().optional(),
  internalNote: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request) {
  const auth = await requirePermission("feedback.read");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const ip = getClientIp(request.headers);
  const limitCheck = checkRateLimit(`feedback-inbox-read:${auth.user.id}:${ip}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!limitCheck.allowed) {
    return NextResponse.json({ success: false, error: "Too many feedback inbox requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    cursor: url.searchParams.get("cursor") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    scoreBand: url.searchParams.get("scoreBand") || undefined,
    hostEmployeeId: url.searchParams.get("hostEmployeeId") || undefined,
    branchId: url.searchParams.get("branchId") || undefined,
    reviewed: url.searchParams.get("reviewed") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid feedback inbox filters." }, { status: 400 });
  }

  const filters = parsed.data;
  const scoreWhere =
    filters.scoreBand === "PROMOTER"
      ? { npsScore: { gte: 9 } }
      : filters.scoreBand === "PASSIVE"
        ? { npsScore: { gte: 7, lte: 8 } }
        : filters.scoreBand === "DETRACTOR"
          ? { npsScore: { lte: 6 } }
          : {};
  const reviewedWhere =
    filters.reviewed === "REVIEWED"
      ? { reviewedAt: { not: null } }
      : filters.reviewed === "UNREVIEWED"
        ? { reviewedAt: null }
        : {};

  const employeeScope =
    auth.user.role === "EMPLOYEE" || !can(auth.user, "feedback.manage")
      ? { hostEmployeeId: auth.user.employeeId || "__none__" }
      : {};

  const responses = await prisma.feedbackResponse.findMany({
    where: {
      organizationId: orgCheck.organizationId,
      ...scoreWhere,
      ...reviewedWhere,
      ...(filters.hostEmployeeId ? { hostEmployeeId: filters.hostEmployeeId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
      ...employeeScope,
    },
    include: {
      hostEmployee: {
        select: {
          id: true,
          user: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          office: {
            select: {
              id: true,
              name: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = responses.length > filters.limit;
  const page = hasMore ? responses.slice(0, filters.limit) : responses;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;

  const [hosts, branches] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organizationId: orgCheck.organizationId,
        deletedAt: null,
        ...(auth.user.role === "EMPLOYEE" ? { id: auth.user.employeeId || "__none__" } : {}),
      },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
      take: 200,
    }),
    prisma.branch.findMany({
      where: { organizationId: orgCheck.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "FEEDBACK_VIEWED",
    entity: "FEEDBACK_RESPONSE",
    entityId: null,
    details: { count: page.length, filters },
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    data: page,
    nextCursor,
    hosts: hosts.map((host) => ({ id: host.id, name: host.user.name })),
    branches,
  });
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("feedback.manage");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const ip = getClientIp(request.headers);
  const limitCheck = checkRateLimit(`feedback-inbox-manage:${auth.user.id}:${ip}`, {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!limitCheck.allowed) {
    return NextResponse.json({ success: false, error: "Too many feedback updates." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid feedback update." }, { status: 400 });
  }
  const existing = await prisma.feedbackResponse.findFirst({
    where: {
      id: parsed.data.id,
      organizationId: orgCheck.organizationId,
    },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Feedback response not found." }, { status: 404 });
  }

  const sanitizedNote = parsed.data.internalNote
    ?.replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const updated = await prisma.feedbackResponse.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.reviewed !== undefined
        ? { reviewedAt: parsed.data.reviewed ? new Date() : null, reviewedById: parsed.data.reviewed ? auth.user.id : null }
        : {}),
      ...(parsed.data.internalNote !== undefined ? { internalNote: sanitizedNote || null } : {}),
    },
  });

  audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "FEEDBACK_MANAGED",
    entity: "FEEDBACK_RESPONSE",
    entityId: existing.id,
    details: {
      reviewed: parsed.data.reviewed,
      internalNoteChanged: parsed.data.internalNote !== undefined,
    },
  }).catch(console.error);

  return NextResponse.json({ success: true, data: updated });
}
