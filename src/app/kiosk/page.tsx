import React from "react";
import prisma from "@/lib/db";
import { KioskClientView } from "./KioskClientView";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  // Fetch default organization and active hosts
  const org = await prisma.organization.findFirst({
    include: {
      visitorTypes: true,
      employees: {
        include: {
          user: { select: { name: true, email: true } },
          department: true,
          office: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col justify-between p-6 md:p-10 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <KioskClientView
        orgName={org?.name || "Entrivo Global Tech Park"}
        employees={org?.employees || []}
        visitorTypes={org?.visitorTypes || []}
      />
    </div>
  );
}
