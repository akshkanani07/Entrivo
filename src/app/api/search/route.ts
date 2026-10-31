import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, results: [] });
    }

    const orgId = user.organizationId;
    const orgFilter = orgId ? { organizationId: orgId } : {};

    const [visitors, employees, invitations, checkIns] = await Promise.all([
      prisma.visitor.findMany({
        where: {
          ...orgFilter,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        include: { visitorType: true },
      }),
      prisma.employee.findMany({
        where: {
          ...orgFilter,
          OR: [
            { user: { name: { contains: q, mode: "insensitive" } } },
            { employeeCode: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 4,
        include: { user: true, office: true },
      }),
      prisma.invitation.findMany({
        where: {
          ...orgFilter,
          OR: [
            { qrToken: { contains: q, mode: "insensitive" } },
            { visitor: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: 4,
        include: { visitor: true, hostEmployee: { include: { user: true } } },
      }),
      prisma.checkIn.findMany({
        where: {
          status: "CHECKED_IN",
          ...(orgId ? { visitor: { organizationId: orgId } } : {}),
          OR: [
            { badgeNumber: { contains: q, mode: "insensitive" } },
            { visitor: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: 4,
        include: { visitor: true },
      }),
    ]);

    const results = [
      ...visitors.map((v) => ({
        type: "VISITOR",
        title: v.name,
        subtitle: `${v.company || "Guest"} • ${v.phone}`,
        url: `/visitors?search=${encodeURIComponent(v.name)}`,
      })),
      ...employees.map((e) => ({
        type: "EMPLOYEE",
        title: e.user.name,
        subtitle: `${e.employeeCode} • ${e.office?.name || "Office"}`,
        url: `/employees`,
      })),
      ...invitations.map((i) => ({
        type: "INVITATION",
        title: `Pass: ${i.qrToken}`,
        subtitle: `For ${i.visitor.name} by ${i.hostEmployee.user.name}`,
        url: `/pass/${i.qrToken}`,
      })),
      ...checkIns.map((c) => ({
        type: "ACTIVE_BADGE",
        title: `Badge: ${c.badgeNumber}`,
        subtitle: `Active inside facility (${c.visitor.name})`,
        url: `/badge/${c.id}`,
      })),
    ];

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Failed to perform search" }, { status: 500 });
  }
}
