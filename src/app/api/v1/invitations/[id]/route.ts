import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request, "invitations:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { id } = await params;

  const invitation = await prisma.invitation.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      scheduledDate: true,
      startTime: true,
      endTime: true,
      purpose: true,
      notes: true,
      qrToken: true,
      passUrl: true,
      calendarEventId: true,
      calendarProvider: true,
      visitor: {
        select: { id: true, name: true, email: true, phone: true, company: true },
      },
      hostEmployee: {
        select: {
          id: true,
          designation: true,
          user: { select: { name: true, email: true } },
        },
      },
      meetingRoom: {
        select: { id: true, name: true, capacity: true },
      },
      checkIns: {
        select: {
          id: true,
          status: true,
          checkInTime: true,
          badgeNumber: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { success: false, error: "Invitation not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  return NextResponse.json({ success: true, data: invitation }, { headers: auth.headers });
}
