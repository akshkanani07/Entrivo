import { requirePagePermission } from "@/lib/rbac";
import { MusterHistoryClient } from "@/components/muster/MusterHistoryClient";

export default async function MusterHistoryPage() {
  await requirePagePermission("muster.view");
  return <MusterHistoryClient />;
}
