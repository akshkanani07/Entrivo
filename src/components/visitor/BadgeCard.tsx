"use client";

import React, { useEffect, useState } from "react";
import { Printer, Download, ShieldCheck, Building2, Calendar, UserCheck } from "lucide-react";
import { generateQRCodeDataUrl } from "@/lib/qr-client";

export interface BadgeData {
  badgeNumber: string;
  visitorName: string;
  visitorCompany?: string | null;
  visitorTypeName?: string | null;
  badgeColor?: string;
  hostName: string;
  hostOffice?: string | null;
  photoUrl?: string | null;
  issueDate: string;
  token?: string;
}

export function BadgeCard({ data }: { data: BadgeData }) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    const qrPayload = data.token || data.badgeNumber || "BADGE";
    generateQRCodeDataUrl(qrPayload).then(setQrCodeUrl).catch(console.error);
  }, [data]);

  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Visual Badge Card */}
      <div className="printable-badge-area w-[340px] bg-slate-900 border-2 border-indigo-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden text-slate-100 font-sans print:shadow-none print:border-slate-800 print:text-black">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 print:border-slate-300 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md text-sm">
              E
            </div>
            <div>
              <h4 className="text-xs font-bold tracking-wider uppercase text-white print:text-black">ENTRIVO</h4>
              <p className="text-[10px] text-slate-400 print:text-slate-600 font-medium">VISITOR ACCESS</p>
            </div>
          </div>
          <div
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-white"
            style={{ backgroundColor: data.badgeColor || "#4f46e5" }}
          >
            {data.visitorTypeName || "GUEST"}
          </div>
        </div>

        {/* Center: Photo & Details */}
        <div className="flex gap-4 items-center mb-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-800 border-2 border-slate-700 flex-shrink-0 shadow-md">
            {data.photoUrl ? (
              <img src={data.photoUrl} alt={data.visitorName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-indigo-950/60 text-indigo-300 font-bold text-xl">
                {data.visitorName.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white print:text-black truncate">{data.visitorName}</h3>
            <p className="text-xs text-indigo-300 print:text-indigo-800 font-medium truncate">
              {data.visitorCompany || "Independent"}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-mono bg-slate-800/80 print:bg-slate-200 px-2 py-0.5 rounded border border-slate-700 print:border-slate-300">
              <span className="text-slate-400 print:text-slate-600">ID:</span>
              <span className="font-bold text-indigo-400 print:text-black">{data.badgeNumber}</span>
            </div>
          </div>
        </div>

        {/* Host & Location Box */}
        <div className="bg-slate-950/70 print:bg-slate-100 rounded-xl p-3 border border-slate-800/80 print:border-slate-300 mb-4 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 print:text-slate-600 flex items-center gap-1 text-[11px]">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Host
            </span>
            <span className="font-semibold text-white print:text-black truncate max-w-[170px]">{data.hostName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 print:text-slate-600 flex items-center gap-1 text-[11px]">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" /> Office / Area
            </span>
            <span className="font-medium text-slate-300 print:text-slate-800 truncate max-w-[170px]">
              {data.hostOffice || "Campus Suite"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 print:text-slate-600 flex items-center gap-1 text-[11px]">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Date
            </span>
            <span className="text-slate-300 print:text-slate-800 font-mono text-[11px]">{data.issueDate}</span>
          </div>
        </div>

        {/* Bottom: QR Code Verification */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[10px] text-slate-400 print:text-slate-600 space-y-0.5">
            <div className="flex items-center gap-1 text-emerald-400 font-semibold print:text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" /> Security Verified
            </div>
            <div>Wear badge at all times.</div>
            <div>Return to desk at checkout.</div>
          </div>
          <div className="w-16 h-16 bg-white p-1 rounded-lg border border-slate-300 shadow-sm flex items-center justify-center">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Badge QR" className="w-full h-full" />
            ) : (
              <div className="text-[8px] text-black font-mono">LOADING</div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons (Excluded from print) */}
      <div className="flex items-center gap-3 no-print">
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-glow transition-all"
        >
          <Printer className="w-4 h-4" />
          Print Badge Pass
        </button>
      </div>
    </div>
  );
}
