import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString, optionalString } from "@/lib/zod-helpers";

const holidaySchema = z.object({
  name: requiredString("Holiday name is required"),
  date: requiredString("Start date is required"),
  endDate: optionalString(),
  isRecurring: z.boolean().optional().nullable(),
  branchId: optionalString(),
  description: optionalString(),
  action: optionalString(),
  csvContent: optionalString(),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const year = searchParams.get("year");

    const holidays = await prisma.holiday.findMany({
      where: {
        organizationId: orgId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ success: true, data: holidays });
  } catch (error) {
    console.error("[Holidays GET] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to list holidays" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const body = await request.json().catch(() => null);

    // CSV Import Action
    if (body?.action === "import_csv" && body.csvContent) {
      const lines = (body.csvContent as string)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const createdList = [];
      // Expect header: Name,Date,EndDate,IsRecurring,BranchCode
      const startIndex = lines[0].toLowerCase().includes("name") ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim());
        if (parts.length >= 2) {
          const [name, dateStr, endDateStr, isRecurringStr, branchCode] = parts;
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            let branchId = null;
            if (branchCode) {
              const b = await prisma.branch.findFirst({
                where: { code: branchCode.toUpperCase(), organizationId: orgId },
              });
              if (b) branchId = b.id;
            }

            const h = await prisma.holiday.create({
              data: {
                organizationId: orgId,
                name,
                date,
                endDate: endDateStr ? new Date(endDateStr) : null,
                isRecurring: isRecurringStr?.toLowerCase() === "true" || isRecurringStr === "1",
                branchId,
              },
            });
            createdList.push(h);
          }
        }
      }

      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: auth.user.id,
          action: "HOLIDAYS_IMPORTED",
          entity: "Holiday",
          details: `Imported ${createdList.length} holidays via CSV.`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Successfully imported ${createdList.length} holidays.`,
        data: createdList,
      });
    }

    // Single creation
    const parsed = holidaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, date, endDate, isRecurring, branchId, description } = parsed.data;

    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, organizationId: orgId },
      });
      if (!branch) {
        return NextResponse.json({ success: false, error: "Branch not found" }, { status: 400 });
      }
    }

    const holiday = await prisma.holiday.create({
      data: {
        organizationId: orgId,
        name: name.trim(),
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        isRecurring: Boolean(isRecurring),
        branchId: branchId || null,
        description: description?.trim() || null,
      },
      include: { branch: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "HOLIDAY_CREATED",
        entity: "Holiday",
        entityId: holiday.id,
        details: JSON.stringify({ name: holiday.name, date: holiday.date }),
      },
    });

    return NextResponse.json({ success: true, data: holiday }, { status: 201 });
  } catch (error) {
    console.error("[Holidays POST] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create holiday" }, { status: 500 });
  }
}

