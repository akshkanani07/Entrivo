import { requirePagePermission } from "@/lib/rbac";
import { PreRegistrationQueue } from "./PreRegistrationQueue";

export const dynamic = "force-dynamic";

export default async function PreRegistrationsPage() {
  await requirePagePermission("preregistration.read");
  return <PreRegistrationQueue />;
}
