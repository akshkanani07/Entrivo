import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request, "checkins:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { id } = await params;

  const checkIn = await prisma.checkIn.findFirst({
    where: {
      id,
      visitor: { organizationId, deletedAt: null },
    },
    select: {
      id: true,
      status: true,
      badgeNumber: true,
      checkInTime: true,
      expectedCheckout: true,
      photoUrl: true,
      ndaSigned: true,
      consentGiven: true,
      consentVersion: true,
      receptionistName: true,
      securityGuardName: true,
      visitor: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
          avatarUrl: true,
        },
      },
      hostEmployee: {
        select: {
          id: true,
          designation: true,
          user: { select: { name: true, email: true } },
        },
      },
      invitation: {
        select: { id: true, purpose: true, qrToken: true, scheduledDate: true },
      },
      checkOut: {
        select: {
          id: true,
          checkOutTime: true,
          durationMinutes: true,
          checkoutMethod: true,
          exitNotes: true,
        },
      },
    },
  });

  if (!checkIn) {
    return NextResponse.json(
      { success: false, error: "Check-in record not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  return NextResponse.json({ success: true, data: checkIn }, { headers: auth.headers });
}

