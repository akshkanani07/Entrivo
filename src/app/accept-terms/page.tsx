import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";
import { AcceptTermsClient } from "./AcceptTermsClient";

export const dynamic = "force-dynamic";

export default async function AcceptTermsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // If already accepted current version, redirect directly to dashboard
  if (user.termsVersion === LEGAL_VERSION) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-4">
      <AcceptTermsClient userName={user.name} legalVersion={LEGAL_VERSION} />
    </div>
  );
}

