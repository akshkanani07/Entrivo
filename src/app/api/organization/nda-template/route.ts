import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { getOrSeedNdaTemplate } from "@/services/documents/nda.service";
import { prisma } from "@/lib/db";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import { z } from "zod";

const updateNdaTemplateSchema = z.object({
  title: requiredString("Template title is required"),
  content: requiredString("Template content is required"),
  version: optionalString(),
  validityDays: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? 365 : Number(v)),
    z.number().min(1).max(730)
  ),
});

export async function GET() {
  try {
    const auth = await requirePermission("documents.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const template = await getOrSeedNdaTemplate(organizationId);

    return NextResponse.json({ success: true, data: template });
  } catch (error: any) {
    console.error("NDA template GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load NDA template" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("settings.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json().catch(() => null);
    const parsed = updateNdaTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const current = await getOrSeedNdaTemplate(organizationId);

    // Increment minor version if not explicitly supplied
    let newVersion = parsed.data.version;
    if (!newVersion) {
      const parts = (current.version || "1.0").split(".");
      const major = parseInt(parts[0] || "1", 10);
      const minor = parseInt(parts[1] || "0", 10) + 1;
      newVersion = `${major}.${minor}`;
    }

    const updated = await prisma.ndaTemplate.update({
      where: { id: current.id },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        version: newVersion,
        validityDays: parsed.data.validityDays,
        createdById: auth.user.id,
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: auth.user.id,
        action: "NDA_TEMPLATE_UPDATE",
        entity: "NDA_TEMPLATE",
        entityId: updated.id,
        details: `Updated NDA Template to version ${updated.version} (${updated.title}) with ${updated.validityDays} validity days.`,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `NDA Template updated to v${updated.version} successfully.`,
    });
  } catch (error: any) {
    console.error("NDA template PUT error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update NDA template" },
      { status: 500 }
    );
  }
}
