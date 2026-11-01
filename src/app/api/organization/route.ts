import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";

const updateOrgSchema = z.object({
  name: z.string().optional().nullable(),
  workingHours: z.string().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable().or(z.literal("")),
  city: z.string().optional().nullable().or(z.literal("")),
  country: z.string().optional().nullable().or(z.literal("")),
  contactEmail: z.string().email().optional().nullable().or(z.literal("")),
  contactPhone: z.string().optional().nullable().or(z.literal("")),
  checkInPolicy: z.string().optional().nullable().or(z.literal("")),
  policies: z.record(z.any()).optional().nullable(),
});

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
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

    return NextResponse.json({ success: true, data: organization });
  } catch (error) {
    console.error("Organization GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch organization details" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json();
    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const {
      name,
      workingHours,
      address,
      city,
      country,
      contactEmail,
      contactPhone,
      checkInPolicy,
      policies,
    } = parsed.data;

    // 1. Update Organization core details
    const updatedOrg = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(name ? { name } : {}),
        ...(workingHours !== undefined ? { workingHours: workingHours || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(city !== undefined ? { city: city || null } : {}),
        ...(country !== undefined ? { country: country || null } : {}),
        ...(contactEmail !== undefined ? { contactEmail: contactEmail || null } : {}),
        ...(contactPhone !== undefined ? { contactPhone: contactPhone || null } : {}),
        ...(checkInPolicy !== undefined ? { checkInPolicy: checkInPolicy || null } : {}),
      },
    });

    // 2. If security policies provided, update Settings table
    if (policies && typeof policies === "object") {
      for (const [key, val] of Object.entries(policies)) {
        await prisma.setting.upsert({
          where: {
            organizationId_key: {
              organizationId,
              key: `policy_${key}`,
            },
          },
          update: {
            value: String(val),
          },
          create: {
            organizationId,
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
        organizationId,
        userId: auth.user.id,
        action: "ORGANIZATION_SETTINGS_UPDATED",
        entity: "ORGANIZATION",
        entityId: organizationId,
        details: `Organization profile and compliance policies updated by ${auth.user.name}`,
      },
    });

    return NextResponse.json({ success: true, data: updatedOrg });
  } catch (error: any) {
    console.error("Organization PUT error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update organization" }, { status: 500 });
  }
}
