import React from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE_NAME,
  themePreferenceSchema,
} from "@/lib/theme";

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

  const cookieStore = await cookies();
  const savedTheme = themePreferenceSchema.safeParse(
    cookieStore.get(THEME_COOKIE_NAME)?.value
  );
  const themePreference = savedTheme.success
    ? savedTheme.data
    : DEFAULT_THEME_PREFERENCE;

  return (
    <>
      <IdleSessionGuard />
      <DashboardShell currentUser={currentUser} themePreference={themePreference}>
        {children}
      </DashboardShell>
    </>
  );
}
