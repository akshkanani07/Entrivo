import { requirePagePermission } from "@/lib/rbac";
import { SelfCheckinQueueClient } from "./SelfCheckinQueueClient";

export default async function SelfCheckinQueuePage() {
  await requirePagePermission("selfcheckin.confirm");
  return <SelfCheckinQueueClient />;
}
