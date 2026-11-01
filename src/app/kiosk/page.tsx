import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import prisma from "@/lib/db";
import { KioskClientView } from "./KioskClientView";
import { checkScheduleAndHolidayPolicy } from "@/lib/settings-registry";
import { Clock, CalendarX, Building2 } from "lucide-react";

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

  // Check schedule and holiday policy for the kiosk terminal
  const scheduleCheck = await checkScheduleAndHolidayPolicy(org.id, new Date());
  if (!scheduleCheck.canProceed) {
    return (
      <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col justify-center items-center p-6 md:p-10 relative overflow-hidden select-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-lg bg-slate-900/80 border border-slate-800 rounded-3xl p-8 md:p-12 text-center backdrop-blur-2xl shadow-2xl relative z-10 space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-950/80 border border-amber-800/60 text-amber-400 mx-auto shadow-inner">
            {scheduleCheck.isHoliday ? <CalendarX className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{org.name}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {scheduleCheck.isHoliday ? "Workplace Terminal Closed Today" : "Reception Terminal Closed"}
            </h1>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              {scheduleCheck.reason || "Self-service check-in is currently unavailable outside permitted operating hours."}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
            <p className="font-semibold text-slate-300">Need Immediate Access or Assistance?</p>
            <p className="mt-1">Please report to the main Security Gate or contact reception directly.</p>
          </div>

          <div className="pt-2 text-[11px] text-slate-600 font-mono">
            Terminal: {kiosk.name} &bull; Security Status: Active
          </div>
        </div>
      </div>
    );
  }

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
