"use client";

import React, { useState } from "react";
import { Mail, MessageSquare, Send, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function NotificationTestClient() {
  const router = useRouter();
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes("@")) {
      toast.error("Please enter a valid recipient email address");
      return;
    }

    setEmailLoading(true);
    try {
      const res = await fetch("/api/notifications/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email delivery failed");

      toast.success(`Mailjet transactional email successfully queued to ${testEmail}!`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Email test failed");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSendTestWhatsApp = async () => {
    if (!testPhone || testPhone.length < 10) {
      toast.error("Please enter a valid mobile number with country code (e.g. +91 98765 00000)");
      return;
    }

    setWaLoading(true);
    try {
      const res = await fetch("/api/notifications/test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "WhatsApp delivery failed");

      toast.success(`WhatsApp Cloud test notification dispatched to ${testPhone}!`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "WhatsApp test failed");
    } finally {
      setWaLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-indigo-500/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold text-white">Live Notification Dispatch Simulator</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Email test */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">
            Mailjet Transactional Test
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="recipient@yourcompany.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSendTestEmail}
              disabled={emailLoading}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {emailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Send Email
            </button>
          </div>
        </div>

        {/* WhatsApp test */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">
            WhatsApp Business Cloud API Test
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSendTestWhatsApp}
              disabled={waLoading}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {waLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
              Send WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
