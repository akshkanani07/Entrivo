import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requirePagePermission } from "@/lib/rbac";
import {
  MusterActiveEventNotice,
  MusterRollCallClient,
} from "@/components/muster/MusterRollCallClient";

export const dynamic = "force-dynamic";

export default async function MusterEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("dashboard.view");
  const { id } = await params;
  const parsedId = z.string().trim().min(1).max(128).safeParse(id);
  if (!parsedId.success) notFound();

  if (!can(user, "muster.view")) {
    return <MusterActiveEventNotice eventId={parsedId.data} />;
  }

  return (
    <MusterRollCallClient
      eventId={parsedId.data}
      actorUserId={user.id}
      organizationId={user.organizationId ?? ""}
      canAccount={can(user, "muster.account")}
      canDeclareAllClear={can(user, "muster.broadcast")}
      canExport={can(user, "reports.export")}
    />
  );
}
