import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, results: [] });
    }

    const [visitors, employees, invitations, checkIns] = await Promise.all([
      prisma.visitor.findMany({
        where: {
          organizationId,
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
          organizationId,
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
          organizationId,
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
          visitor: { organizationId },
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
    console.error("Global search error:", error);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
