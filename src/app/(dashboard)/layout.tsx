import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

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
    <div className="min-h-screen bg-[#080c14] flex">
      {/* Sidebar */}
      <Sidebar currentUser={currentUser} />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <Header currentUser={currentUser} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
