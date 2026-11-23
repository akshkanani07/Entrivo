import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { z } from "zod";
import { requiredString, optionalString, requiredEmail } from "@/lib/zod-helpers";
import { audit } from "@/services/audit/audit.service";

const createVisitorSchema = z.object({
  name: requiredString("Visitor name is required"),
  email: requiredEmail("Valid email address is required"),
  phone: requiredString("Phone number is required", 5),
  company: optionalString(),
  visitorTypeId: optionalString(),
  idProofType: optionalString(),
  idProofNumber: optionalString(),
});

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "visitors:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {
    organizationId,
    deletedAt: null,
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { company: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [visitors, total] = await Promise.all([
    prisma.visitor.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        avatarUrl: true,
        isBlacklisted: true,
        visitorType: {
          select: { id: true, name: true, badgeColor: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.visitor.count({ where }),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: visitors,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    { headers: auth.headers }
  );
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "visitors:write");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const body = await request.json().catch(() => null);
  const parsed = createVisitorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message || "Invalid input",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: auth.headers }
    );
  }

  const { name, email, phone, company, visitorTypeId, idProofType, idProofNumber } = parsed.data;

  // Check if visitor already exists in org
  let visitor = await prisma.visitor.findFirst({
    where: {
      organizationId,
      OR: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        { phone: phone.trim() },
      ],
    },
  });

  if (visitor) {
    // Update existing visitor
    visitor = await prisma.visitor.update({
      where: { id: visitor.id },
      data: {
        name: name.trim(),
        ...(email && { email: email.toLowerCase().trim() }),
        ...(company && { company: company.trim() }),
        ...(visitorTypeId && { visitorTypeId }),
        ...(idProofType && { idProofType: idProofType.trim() }),
        ...(idProofNumber && { idProofNumber: idProofNumber.trim() }),
      },
    });
  } else {
    visitor = await prisma.visitor.create({
      data: {
        organizationId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        company: company ? company.trim() : "Guest",
        visitorTypeId: visitorTypeId || null,
        idProofType: idProofType ? idProofType.trim() : null,
        idProofNumber: idProofNumber ? idProofNumber.trim() : null,
      },
    });
  }

  audit({
    organizationId,
    action: "VISITOR_CREATE",
    entity: "VISITOR",
    entityId: visitor.id,
    details: { name: visitor.name, email: visitor.email, source: "API_V1" },
  }).catch(console.error);

  return NextResponse.json(
    {
      success: true,
      data: visitor,
      message: "Visitor successfully registered",
    },
    { status: 201, headers: auth.headers }
  );
}
