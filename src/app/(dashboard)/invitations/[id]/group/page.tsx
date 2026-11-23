import { notFound } from "next/navigation";
import { requireAnyPagePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { GroupCheckinClient } from "./GroupCheckinClient";

export const dynamic = "force-dynamic";

export default async function GroupCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAnyPagePermission(["invitations.read.all", "invitations.read.own"]);
  const { id } = await params;
  const invitation = await prisma.invitation.findFirst({
    where: {
      id,
      organizationId: user.organizationId || "__none__",
      ...(user.role === "EMPLOYEE" ? { hostEmployeeId: user.employeeId || "__none__" } : {}),
    },
    select: { id: true },
  });
  if (!invitation) notFound();
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <GroupCheckinClient invitationId={invitation.id} />
    </div>
  );
}
