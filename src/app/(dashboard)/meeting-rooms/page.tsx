import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { MeetingRoomsManager } from "@/components/meeting-rooms/MeetingRoomsManager";

export const dynamic = "force-dynamic";

export default async function MeetingRoomsPage() {
  const user = await requirePagePermission("meetingRooms.read");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  let rooms: any[] = [];
  let offices: any[] = [];

  try {
    const [roomList, officeList] = await Promise.all([
      prisma.meetingRoom.findMany({
        where: { office: { branch: { organizationId: orgId } }, deletedAt: null },
        include: {
          office: { include: { branch: true } },
          invitations: {
            where: { scheduledDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
            include: { visitor: true, hostEmployee: { include: { user: true } } },
            take: 3,
            orderBy: { startTime: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.office.findMany({
        where: { branch: { organizationId: orgId } },
        orderBy: { name: "asc" },
      }),
    ]);

    rooms = roomList;
    offices = officeList;
  } catch (err: any) {
    console.error("Meeting rooms fetch error:", err?.message);
  }

  return <MeetingRoomsManager initialRooms={rooms} offices={offices} />;
}
