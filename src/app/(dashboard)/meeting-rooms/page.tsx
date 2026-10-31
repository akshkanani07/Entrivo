import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MeetingRoomsManager } from "@/components/meeting-rooms/MeetingRoomsManager";

export default async function MeetingRoomsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  let rooms: any[] = [];
  let offices: any[] = [];

  try {
    const [roomList, officeList] = await Promise.all([
      prisma.meetingRoom.findMany({
        where: orgId ? { office: { branch: { organizationId: orgId } }, deletedAt: null } : { deletedAt: null },
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
        where: orgId ? { branch: { organizationId: orgId } } : {},
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
