import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.mustChangePassword) {
    redirect("/change-password");
  }

  if (currentUser.termsVersion !== LEGAL_VERSION) {
    redirect("/accept-terms");
  }

  return (
    <>
      <IdleSessionGuard />
      <DashboardShell currentUser={currentUser}>
        {children}
      </DashboardShell>
    </>
  );
}
