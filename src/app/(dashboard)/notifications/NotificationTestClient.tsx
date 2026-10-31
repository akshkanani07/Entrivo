"use client";

import React, { useState } from "react";
import { Mail, Send, Loader2, Bell, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function NotificationTestClient() {
  const router = useRouter();
  const [testEmail, setTestEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

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

  const handleSendTestPush = async () => {
    setPushLoading(true);
    try {
      const res = await fetch("/api/notifications/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Web push notification test failed");
      }
      toast.success(data.message || "Push notification sent! Check your desktop notification tray.");
    } catch (err: any) {
      toast.error(err.message || "Push notification test failed");
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="glass-card p-5 rounded-2xl border border-indigo-950/70">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Multi-Channel Dispatch Simulator
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Send end-to-end verification payloads across Mailjet transactional email and Web Push notifications.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        {/* Email test */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-indigo-400">
            <Mail className="w-4 h-4" />
            <h4 className="text-xs font-bold text-white">Mailjet Transactional Email Test</h4>
          </div>
          <p className="text-[11px] text-slate-400">
            Verify real Mailjet template rendering, QR pass token attachment, and SMTP delivery.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSendTestEmail}
              disabled={emailLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm transition-all disabled:opacity-50"
            >
              {emailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Email
            </button>
          </div>
        </div>

        {/* Web Push test */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400">
            <Bell className="w-4 h-4" />
            <h4 className="text-xs font-bold text-white">Desktop & Mobile Web Push Test</h4>
          </div>
          <p className="text-[11px] text-slate-400">
            Simulate a real visitor arrival push alert dispatched to your active browser subscription.
          </p>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-300">Target: Current Device</span>
            <button
              onClick={handleSendTestPush}
              disabled={pushLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-glow-sm"
            >
              {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Push Alert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
