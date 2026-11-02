import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { generateApiKey } from "@/lib/api-key-auth";
import { audit } from "@/services/audit/audit.service";
import { requiredString } from "@/lib/zod-helpers";

const createApiKeySchema = z.object({
  name: requiredString("API Key name is required"),
  scopes: z.array(z.string()).default(["visitors:read", "invitations:read"]),
  rateLimit: z.number().int().min(10).max(1000).default(120),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
});

export async function GET() {
  try {
    const auth = await requirePermission("apikeys.read");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const keys = await prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        permissions: true,
        rateLimit: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: keys });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("apikeys.manage");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { name, scopes, rateLimit, expiresInDays } = parsed.data;
    const { rawKey, prefix, keyHash } = generateApiKey(true);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const scopesStr = scopes.join(",");

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        name: name.trim(),
        prefix,
        keyHash,
        scopes: scopesStr,
        permissions: scopesStr,
        rateLimit,
        expiresAt,
        isActive: true,
        createdById: user.id,
      },
    });

    audit({
      organizationId,
      userId: user.id,
      action: "API_KEY_CREATED",
      entity: "API_KEY",
      entityId: apiKey.id,
      details: { name, prefix, scopes: scopesStr, rateLimit, expiresAt },
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        rawKey, // Revealed ONLY ONCE to caller
        scopes: scopes,
        rateLimit: apiKey.rateLimit,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      message: "API key created successfully. Please copy your key now — it cannot be shown again.",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

