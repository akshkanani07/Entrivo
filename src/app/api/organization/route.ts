import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { optionalString, optionalEmail } from "@/lib/zod-helpers";

const updateOrgSchema = z.object({
  name: optionalString(),
  logo: optionalString(),
  brandColor: optionalString(),
  timezone: optionalString(),
  locale: optionalString(),
  workingHours: optionalString(),
  address: optionalString(),
  city: optionalString(),
  country: optionalString(),
  contactEmail: optionalEmail(),
  contactPhone: optionalString(),
  checkInPolicy: optionalString(),
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
      logo,
      brandColor,
      timezone,
      locale,
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
        ...(logo !== undefined ? { logo: logo || null } : {}),
        ...(brandColor !== undefined ? { brandColor: brandColor || null } : {}),
        ...(timezone !== undefined ? { timezone: timezone || "Asia/Kolkata" } : {}),
        ...(locale !== undefined ? { locale: locale || "en-IN" } : {}),
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
