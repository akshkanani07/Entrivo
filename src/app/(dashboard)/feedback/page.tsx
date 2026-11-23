import { requirePagePermission } from "@/lib/rbac";
import { FeedbackInboxClient } from "./FeedbackInboxClient";

export const dynamic = "force-dynamic";

export default async function FeedbackInboxPage() {
  await requirePagePermission("feedback.read");
  return <FeedbackInboxClient />;
}
