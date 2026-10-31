import React from "react";
import prisma from "@/lib/db";
import { generateQRCodeDataUrl } from "@/lib/qr";
import { formatDate } from "@/lib/utils";
import {
  ShieldCheck,
  Building2,
  Calendar,
  Clock,
  UserCheck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicPassPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Strict lookup by qrToken ONLY (no raw ID fallback)
  const invitation = await prisma.invitation.findFirst({
    where: { qrToken: token },
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true, office: { include: { branch: true } } } },
      meetingRoom: true,
      organization: true,
    },
  });

  const isInvalid = !invitation;
  const isExpired = invitation ? invitation.status === "EXPIRED" || invitation.status === "COMPLETED" : false;
  const isCancelled = invitation ? invitation.status === "CANCELLED" || invitation.status === "REJECTED" : false;

  if (isInvalid || isExpired || isCancelled) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="w-full max-w-md relative z-10 glass-card rounded-3xl border border-rose-950/60 p-8 shadow-2xl text-center space-y-5">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            {isCancelled ? <XCircle className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold uppercase tracking-wider">
              {isCancelled ? "Invitation Revoked" : isExpired ? "Pass Expired" : "Invalid Pass"}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isCancelled
                ? "This Visitor Pass Has Been Cancelled"
                : isExpired
                ? "This Visitor Pass Has Expired"
                : "Pass Not Found"}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isCancelled
                ? "The workplace host or security team has cancelled this entry pass. Please contact your host to request a new invitation."
                : isExpired
                ? "The scheduled date or validity window for this workplace pass has elapsed. Please request a new pass from your host."
                : "The access token provided does not match any active visitor pass record."}
            </p>
          </div>

          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
            Entrivo Zero-Trust Workplace Visitor Management
          </div>
        </div>
      </div>
    );
  }

  const qrDataUrl = await generateQRCodeDataUrl(invitation.qrToken);

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Background Micro Glow */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4">
        {/* Pass Top Bar */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/40 text-indigo-300 text-xs font-semibold mb-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            Official Workplace Express Pass
          </div>
          <h1 className="text-xl font-bold text-white">{invitation.organization.name}</h1>
          <p className="text-xs text-slate-400">Scan at Turnstile or Concierge Desk</p>
        </div>

        {/* Digital Pass Card */}
        <div className="glass-card rounded-3xl border-2 border-indigo-500/40 p-6 shadow-2xl relative overflow-hidden space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Visitor Pass
              </span>
              <h2 className="text-base font-bold text-white">{invitation.visitor.name}</h2>
              <p className="text-xs text-indigo-300">{invitation.visitor.company}</p>
            </div>
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white uppercase tracking-wider"
              style={{ backgroundColor: invitation.visitor.visitorType?.badgeColor || "#6366f1" }}
            >
              {invitation.visitor.visitorType?.name || "GUEST"}
            </span>
          </div>

          {/* QR Code Presentation Box */}
          <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner">
            <img src={qrDataUrl} alt="Visitor QR Pass" className="w-56 h-56 object-contain" />
            <span className="mt-2 text-xs font-mono font-bold text-black tracking-widest">
              {invitation.qrToken}
            </span>
          </div>

          {/* Meeting Details */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Host
              </span>
              <span className="font-semibold text-white">{invitation.hostEmployee.user.name}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Date
              </span>
              <span className="font-semibold text-white">{formatDate(invitation.scheduledDate)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Time Window
              </span>
              <span className="font-mono text-cyan-400 font-semibold">
                {invitation.startTime} - {invitation.endTime}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" /> Room / Area
              </span>
              <span className="text-slate-200">{invitation.meetingRoom?.name || "Executive Suite"}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" /> Facility
              </span>
              <span className="text-slate-300 truncate max-w-[190px]">
                {invitation.organization.address || "Main Tech Campus"}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-center text-slate-400 space-y-1">
            <p className="flex items-center justify-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Pre-approved for fast-track entry
            </p>
            <p className="text-slate-500">
              Please present this pass upon entering security gates.
            </p>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-500">
          Powered by Entrivo Workplace Access Platform • Modern Touchless Entry
        </div>
      </div>
    </div>
  );
}
