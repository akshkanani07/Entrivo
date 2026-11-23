import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac-base";
import { ContractorManagementClient } from "./ContractorManagementClient";

export const dynamic = "force-dynamic";

export default async function ContractorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "contractors.read") && !can(user, "contractors.manage")) redirect("/forbidden");
  return (
    <ContractorManagementClient
      canManage={can(user, "contractors.manage")}
      canOverride={can(user, "compliance.override")}
    />
  );
}
