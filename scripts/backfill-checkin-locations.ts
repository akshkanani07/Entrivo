import { PrismaClient } from "@prisma/client";
import { resolveCheckInLocation } from "../src/services/muster/muster-core";

const prisma = new PrismaClient();

async function main() {
  const checkIns = await prisma.checkIn.findMany({
    where: {
      status: "CHECKED_IN",
      visitor: { organizationId: { not: "" } },
      OR: [{ floorId: null }, { zoneId: null }],
    },
    include: {
      visitor: { select: { organizationId: true } },
      invitation: {
        select: {
          meetingRoom: {
            select: {
              floorId: true,
              zoneId: true,
              zoneRef: { select: { floorId: true } },
            },
          },
        },
      },
      hostEmployee: {
        select: {
          office: {
            select: { floor: true, floors: { select: { id: true, name: true, number: true } } },
          },
        },
      },
    },
  });

  let updated = 0;
  for (const checkIn of checkIns) {
    const location = resolveCheckInLocation({
      meetingRoom: checkIn.invitation?.meetingRoom
        ? {
            floorId: checkIn.invitation.meetingRoom.floorId,
            zoneId: checkIn.invitation.meetingRoom.zoneId,
            zoneFloorId: checkIn.invitation.meetingRoom.zoneRef?.floorId,
          }
        : null,
      office: checkIn.hostEmployee.office,
    });

    if (!location.floorId && !location.zoneId) continue;

    const result = await prisma.checkIn.updateMany({
      where: {
        id: checkIn.id,
        status: "CHECKED_IN",
        visitor: { organizationId: checkIn.visitor.organizationId },
      },
      data: {
        ...(checkIn.floorId ? {} : { floorId: location.floorId }),
        ...(checkIn.zoneId ? {} : { zoneId: location.zoneId }),
      },
    });
    updated += result.count;
  }

  console.log(`Updated location data for ${updated} checked-in records.`);
}

main()
  .catch((error) => {
    console.error("Check-in location backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
