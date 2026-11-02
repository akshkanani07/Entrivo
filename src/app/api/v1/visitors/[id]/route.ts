import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request, "visitors:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { id } = await params;

  const visitor = await prisma.visitor.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      avatarUrl: true,
      isBlacklisted: true,
      blacklistReason: true,
      visitorType: {
        select: { id: true, name: true, badgeColor: true },
      },
      checkIns: {
        select: {
          id: true,
          checkInTime: true,
          status: true,
          badgeNumber: true,
          hostEmployee: {
            select: { id: true, user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { checkInTime: "desc" },
        take: 10,
      },
      invitations: {
        select: {
          id: true,
          scheduledDate: true,
          startTime: true,
          endTime: true,
          status: true,
          purpose: true,
        },
        orderBy: { scheduledDate: "desc" },
        take: 10,
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!visitor) {
    return NextResponse.json(
      { success: false, error: "Visitor not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  return NextResponse.json({ success: true, data: visitor }, { headers: auth.headers });
}
