import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = user.organizationId;

    const rooms = await prisma.meetingRoom.findMany({
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
    });

    const offices = await prisma.office.findMany({
      where: orgId ? { branch: { organizationId: orgId } } : {},
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: rooms, offices });
  } catch (error: any) {
    console.error("Meeting rooms GET error:", error);
    return NextResponse.json({ error: "Failed to fetch meeting rooms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, name, officeId, capacity, floor, amenities, isAvailable } = body;
    const orgId = user.organizationId;

    // 1-Click Seed Sample Meeting Rooms
    if (action === "seed_sample") {
      let branch = await prisma.branch.findFirst({ where: { organizationId: orgId } });
      if (!branch) {
        branch = await prisma.branch.create({
          data: { name: "Headquarters Campus", code: "HQ", organizationId: orgId },
        });
      }

      let office = await prisma.office.findFirst({ where: { branchId: branch.id } });
      if (!office) {
        office = await prisma.office.create({
          data: { name: "Main Tower - Floor 1", branchId: branch.id },
        });
      }

      const sampleRooms = [
        {
          name: "Executive Boardroom Alpha",
          capacity: 16,
          floor: "Floor 4 - Executive Wing",
          amenities: "4K Dual Displays, Zoom Rooms Bar, Ceiling Mic Array, Touch Controller, Espresso Bar",
          isAvailable: true,
        },
        {
          name: "Innovation Conference Suite B",
          capacity: 10,
          floor: "Floor 3 - Product Deck",
          amenities: "85-inch Interactive Whiteboard, Video Conference Bar, High-Speed WiFi 6",
          isAvailable: true,
        },
        {
          name: "Client Interview Lounge 1",
          capacity: 4,
          floor: "Floor 1 - Welcome Lobby",
          amenities: "Acoustic Glass, Presentation Display, Wireless Screen Mirroring",
          isAvailable: true,
        },
        {
          name: "Strategic Huddle Room C",
          capacity: 6,
          floor: "Floor 2 - Engineering Hub",
          amenities: "Whiteboard Wall, Polycom Conference Phone, Ultra-wide Video Cam",
          isAvailable: true,
        },
      ];

      for (const r of sampleRooms) {
        await prisma.meetingRoom.create({
          data: {
            ...r,
            officeId: office.id,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: "4 Executive Meeting Rooms initialized successfully!",
      });
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: "Meeting room name is required" }, { status: 400 });
    }

    let finalOfficeId = officeId;
    if (!finalOfficeId) {
      let office = await prisma.office.findFirst({
        where: { branch: { organizationId: orgId } },
      });
      if (!office) {
        let branch = await prisma.branch.create({
          data: { name: "Main Campus", code: "MAIN", organizationId: orgId },
        });
        office = await prisma.office.create({
          data: { name: "Main Building - Floor 1", branchId: branch.id },
        });
      }
      finalOfficeId = office.id;
    }

    const room = await prisma.meetingRoom.create({
      data: {
        name: name.trim(),
        officeId: finalOfficeId,
        capacity: Number(capacity) || 6,
        floor: floor?.trim() || "Floor 1",
        amenities: amenities?.trim() || "4K Display, Video Conference Bar, Whiteboard",
        isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
      },
      include: {
        office: true,
        invitations: true,
      },
    });

    return NextResponse.json({ success: true, data: room });
  } catch (error: any) {
    console.error("Meeting room create error:", error);
    return NextResponse.json({ error: error.message || "Failed to create meeting room" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, capacity, floor, amenities, isAvailable } = body;

    if (!id) {
      return NextResponse.json({ error: "Meeting room ID is required" }, { status: 400 });
    }

    const updated = await prisma.meetingRoom.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(floor !== undefined ? { floor: floor.trim() } : {}),
        ...(amenities !== undefined ? { amenities: amenities.trim() } : {}),
        ...(isAvailable !== undefined ? { isAvailable: Boolean(isAvailable) } : {}),
      },
      include: { office: true, invitations: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Meeting room update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update meeting room" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Meeting room ID is required" }, { status: 400 });
    }

    await prisma.meetingRoom.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Meeting room deleted successfully" });
  } catch (error: any) {
    console.error("Meeting room delete error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete meeting room" }, { status: 500 });
  }
}
