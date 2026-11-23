import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountMusterEntry } from "@/services/muster/muster.service";
import { requiredString } from "@/lib/zod-helpers";
import { authorizeMuster, auditMusterAction, musterErrorResponse } from "../../../../_helpers";

const bodySchema = z.object({
  status: z.enum(["SAFE", "MISSING", "HOSPITAL"]),
  musterPointId: z.string().trim().min(1).max(128).optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const context = await authorizeMuster(request, "muster.account", "account", 60);
  if ("response" in context) return context.response;

  const { id, entryId } = await params;
  const parsedIds = z.object({
    id: requiredString("Emergency event is required").pipe(z.string().max(128)),
    entryId: requiredString("Muster entry is required").pipe(z.string().max(128)),
  }).safeParse({ id, entryId });
  if (!parsedIds.success) {
    return NextResponse.json(
      { success: false, error: parsedIds.error.issues[0]?.message ?? "Invalid identifiers" },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  const parsedKey = z.string().trim().min(8).max(128).safeParse(idempotencyKey);
  if (!parsedKey.success) {
    return NextResponse.json(
      { success: false, error: "A valid Idempotency-Key header is required." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: parsedBody.error.issues[0]?.message ?? "Invalid roll-call mark" },
      { status: 400 }
    );
  }

  try {
    const entry = await accountMusterEntry({
      ...parsedBody.data,
      organizationId: context.organizationId,
      eventId: parsedIds.data.id,
      entryId: parsedIds.data.entryId,
      actorId: context.user.id,
      clientEventId: parsedKey.data,
    });
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_ACCOUNTED",
      entityId: entry.id,
      details: {
        eventId: parsedIds.data.id,
        status: entry.status,
        ...(entry.musterPointId ? { musterPointId: entry.musterPointId } : {}),
      },
      clientIp: context.clientIp,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: entry.id,
        status: entry.status,
        accountedAt: entry.accountedAt,
        accountedById: entry.accountedById,
        musterPointId: entry.musterPointId,
        note: entry.note,
        clientEventId: entry.clientEventId,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return musterErrorResponse(error);
  }
}
