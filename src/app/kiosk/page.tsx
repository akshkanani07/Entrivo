import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import prisma from "@/lib/db";
import { KioskClientView } from "./KioskClientView";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get("kiosk_token")?.value;

  // If kiosk token cookie is missing, redirect immediately to the hardware pairing page
  if (!rawToken || rawToken.length < 32) {
    redirect("/kiosk/pair");
  }

  // Look up kiosk by SHA-256 hash of device token
  const deviceTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const kiosk = await prisma.kiosk.findUnique({
    where: { deviceTokenHash },
    include: {
      organization: {
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
      },
    },
  });

  const now = new Date();
  if (!kiosk || !kiosk.isActive || (kiosk.expiresAt && kiosk.expiresAt < now)) {
    redirect("/kiosk/pair");
  }

  const org = kiosk.organization;

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col justify-between p-6 md:p-10 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <KioskClientView
        orgName={org.name}
        kioskName={kiosk.name}
        employees={org.employees}
        visitorTypes={org.visitorTypes}
      />
    </div>
  );
}
