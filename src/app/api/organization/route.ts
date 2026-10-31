import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        branches: {
          include: {
            offices: {
              include: {
                meetingRooms: true,
              },
            },
          },
        },
        departments: true,
        visitorTypes: true,
        settings: true,
      },
    });

    return NextResponse.json({ success: true, data: org });
  } catch (error) {
    console.error("Organization GET error:", error);
    return NextResponse.json({ error: "Failed to fetch organization details" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      workingHours,
      address,
      city,
      country,
      contactEmail,
      contactPhone,
      checkInPolicy,
      policies, // Security policies key-value map
    } = body;

    // 1. Update Organization core details
    const updatedOrg = await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(workingHours !== undefined ? { workingHours } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(contactEmail !== undefined ? { contactEmail } : {}),
        ...(contactPhone !== undefined ? { contactPhone } : {}),
        ...(checkInPolicy !== undefined ? { checkInPolicy } : {}),
      },
    });

    // 2. If security policies provided, update Settings table
    if (policies && typeof policies === "object") {
      for (const [key, val] of Object.entries(policies)) {
        await prisma.setting.upsert({
          where: {
            organizationId_key: {
              organizationId: user.organizationId,
              key: `policy_${key}`,
            },
          },
          update: {
            value: String(val),
          },
          create: {
            organizationId: user.organizationId,
            category: "SECURITY_POLICY",
            key: `policy_${key}`,
            value: String(val),
          },
        });
      }
    }

    // 3. Log Audit
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "ORGANIZATION_SETTINGS_UPDATED",
        entity: "ORGANIZATION",
        entityId: user.organizationId,
        details: `Organization profile and security policies updated by ${user.name}`,
      },
    });

    // Fetch refreshed settings
    const settings = await prisma.setting.findMany({
      where: { organizationId: user.organizationId },
    });

    return NextResponse.json({
      success: true,
      message: "Organization configuration saved successfully",
      data: {
        ...updatedOrg,
        settings,
      },
    });
  } catch (error: any) {
    console.error("Organization PUT error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update organization configuration" },
      { status: 500 }
    );
  }
}
