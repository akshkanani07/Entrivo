import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { optionalString, optionalEmail } from "@/lib/zod-helpers";
import { audit } from "@/services/audit/audit.service";
import { invalidateOrgPolicyCache } from "@/lib/settings-registry";

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
    const auth = await requireUser();
    if (auth.response) return auth.response;

    if (!can(auth.user, "org.manage") && !can(auth.user, "settings.manage")) {
      return NextResponse.json(
        { success: false, error: "Forbidden: missing permission 'settings.manage' or 'org.manage'" },
        { status: 403 }
      );
    }

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

    const [existingOrg, existingSettings] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
      }),
      prisma.setting.findMany({
        where: { organizationId },
      }),
    ]);

    const existingSettingsMap: Record<string, any> = {};
    for (const s of existingSettings) {
      existingSettingsMap[s.key] = s.value;
    }

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
    const updatedSettingsMap: Record<string, any> = { ...existingSettingsMap };
    if (policies && typeof policies === "object") {
      for (const [key, val] of Object.entries(policies)) {
        const valStr = typeof val === "object" && val !== null ? JSON.stringify(val) : String(val);
        const settingKey = key.startsWith("policy_") ? key : `policy_${key}`;
        await prisma.setting.upsert({
          where: {
            organizationId_key: {
              organizationId,
              key: settingKey,
            },
          },
          update: {
            value: valStr,
          },
          create: {
            organizationId,
            category: "SECURITY_POLICY",
            key: settingKey,
            value: valStr,
          },
        });
        updatedSettingsMap[settingKey] = valStr;
      }
      invalidateOrgPolicyCache(organizationId);
    }

    // 3. Log Audit with before/after state diff
    audit({
      organizationId,
      userId: auth.user.id,
      action: "SETTINGS_CHANGE",
      entity: "ORGANIZATION",
      entityId: organizationId,
      before: {
        name: existingOrg?.name,
        brandColor: existingOrg?.brandColor,
        timezone: existingOrg?.timezone,
        locale: existingOrg?.locale,
        settings: existingSettingsMap,
      },
      after: {
        name: updatedOrg.name,
        brandColor: updatedOrg.brandColor,
        timezone: updatedOrg.timezone,
        locale: updatedOrg.locale,
        settings: updatedSettingsMap,
      },
      details: { summary: `Organization profile and compliance policies updated by ${auth.user.name}` },
    }).catch(console.error);

    return NextResponse.json({ success: true, data: updatedOrg });
  } catch (error: any) {
    console.error("Organization PUT error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update organization" }, { status: 500 });
  }
}
