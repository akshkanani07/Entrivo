"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, User, Building, Calendar, Clock, MapPin, Send, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

interface EmployeeItem {
  id: string;
  user: { name: string; email: string };
  department?: { name: string } | null;
}

interface RoomItem {
  id: string;
  name: string;
  floor?: string | null;
  capacity: number;
}

interface TypeItem {
  id: string;
  name: string;
}

export function NewInvitationForm({
  employees,
  rooms,
  visitorTypes,
  currentEmployeeId,
}: {
  employees: EmployeeItem[];
  rooms: RoomItem[];
  visitorTypes: TypeItem[];
  currentEmployeeId?: string | null;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    visitorName: "",
    visitorEmail: "",
    visitorPhone: "",
    visitorCompany: "",
    visitorTypeId: visitorTypes[0]?.id || "",
    hostEmployeeId: currentEmployeeId || employees[0]?.id || "",
    scheduledDate: new Date().toISOString().split("T")[0],
    startTime: "11:00",
    endTime: "12:00",
    purpose: "Strategic Enterprise Review",
    meetingRoomId: rooms[0]?.id || "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPass, setCreatedPass] = useState<{ qrToken: string; passUrl: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.visitorName || !formData.visitorEmail || !formData.visitorPhone) {
      setError("Please fill all required visitor fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create invitation");
      }

      setCreatedPass({
        qrToken: data.data.qrToken,
        passUrl: data.data.passUrl || `/pass/${data.data.qrToken}`,
      });
    } catch (err: any) {
      setError(err.message || "Failed to create invitation");
    } finally {
      setLoading(false);
    }
  };

  if (createdPass) {
    return (
      <div className="glass-card rounded-2xl border border-indigo-500/30 p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-indigo-950 text-indigo-400 border border-indigo-500/40 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Invitation Issued & Dispatched!</h2>
          <p className="text-xs text-slate-400 mt-1">
            Express digital entry pass has been emailed to the visitor with multi-channel push and email notifications enabled.
          </p>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-indigo-300">
          Token: <strong className="text-white text-sm">{createdPass.qrToken}</strong>
        </div>

        <div className="flex justify-center gap-3 pt-2">
          <Link
            href={`/pass/${createdPass.qrToken}`}
            target="_blank"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow transition-all"
          >
            Open Live Visitor Pass Screen
          </Link>
          <Link
            href="/invitations"
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
          >
            Return to Invitations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
      {error && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
          {error}
        </div>
      )}

      <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
        Visitor Details
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Visitor Full Name *</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              required
              placeholder="e.g. Maya Krishnan"
              value={formData.visitorName}
              onChange={(e) => setFormData({ ...formData, visitorName: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Company / Organization</label>
          <div className="relative">
            <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="e.g. Sequoia Capital"
              value={formData.visitorCompany}
              onChange={(e) => setFormData({ ...formData, visitorCompany: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address *</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="email"
              required
              placeholder="maya@sequoiacap.com"
              value={formData.visitorEmail}
              onChange={(e) => setFormData({ ...formData, visitorEmail: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Number *</label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="tel"
              required
              placeholder="+91 99000 11223"
              value={formData.visitorPhone}
              onChange={(e) => setFormData({ ...formData, visitorPhone: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
          Meeting & Schedule Details
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Scheduled Date *</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="date"
                required
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Start Time *</label>
            <input
              type="time"
              required
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">End Time</label>
            <input
              type="time"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Host Employee</label>
            <select
              value={formData.hostEmployeeId}
              onChange={(e) => setFormData({ ...formData, hostEmployeeId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.user.name} ({emp.department?.name || "General"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Meeting Room</label>
            <select
              value={formData.meetingRoomId}
              onChange={(e) => setFormData({ ...formData, meetingRoomId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {rooms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name} (Cap: {rm.capacity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Visitor Classification</label>
            <select
              value={formData.visitorTypeId}
              onChange={(e) => setFormData({ ...formData, visitorTypeId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {visitorTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-4">
          <label className="block text-xs font-semibold text-slate-300 mb-1">Purpose of Visit *</label>
          <input
            type="text"
            required
            placeholder="e.g. Quarterly Strategic Board Review"
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Pass & Dispatching...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Issue & Send Invitation Pass
            </>
          )}
        </button>
      </div>
    </form>
  );
}
