import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString } from "@/lib/zod-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const createNoteSchema = z.object({
  content: requiredString("Note text is required").pipe(z.string().max(5000, "Notes must be 5,000 characters or fewer.")),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("visitors.write");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const limit = checkRateLimit(`visitor-note:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many visitor note changes." }, { status: 429 });
  }

  const parsed = createNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Invalid note." },
      { status: 400 }
    );
  }

  const parsedId = z.string().trim().min(1).max(100).safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Visitor ID is invalid." }, { status: 400 });
  }
  const id = parsedId.data;
  const visitor = await prisma.visitor.findFirst({
    where: { id, organizationId: tenant.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!visitor) {
    return NextResponse.json({ success: false, error: "Visitor not found." }, { status: 404 });
  }

  const note = await prisma.visitorNote.create({
    data: {
      organizationId: tenant.organizationId,
      visitorId: visitor.id,
      authorUserId: auth.user.id,
      content: parsed.data.content,
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "VISITOR_NOTE_ADDED",
    entity: "VISITOR",
    entityId: visitor.id,
    details: { noteId: note.id },
  });

  return NextResponse.json({ success: true, data: note });
}
