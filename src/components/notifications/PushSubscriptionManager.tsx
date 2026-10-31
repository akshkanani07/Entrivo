"use client";

import React, { useState, useEffect } from "react";
import { Bell, BellOff, CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushSubscriptionManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(Boolean(sub));
    } catch (err) {
      console.warn("Could not check push subscription:", err);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        toast.error("VAPID Public Key is not configured on the server.");
        setLoading(false);
        return;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        toast.error("Notification permissions were not granted in your browser settings.");
        setLoading(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to register push subscription on server");
      }

      setIsSubscribed(true);
      toast.success("Desktop & Mobile Chrome push notifications successfully enabled!");
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      toast.error(err.message || "Could not enable push notifications");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      toast.info("Push notifications disabled for this device.");
    } catch (err: any) {
      toast.error(err.message || "Failed to disable notifications");
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTestLoading(true);
    try {
      const res = await fetch("/api/notifications/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Test push notification failed");
      }
      toast.success(data.message || "Push notification sent! Check your system notification tray.");
    } catch (err: any) {
      toast.error(err.message || "Test push failed");
    } finally {
      setTestLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="glass-card p-4 rounded-xl border border-slate-800 text-xs text-slate-400">
        Push notifications are not supported in this browser environment.
      </div>
    );
  }

  return (
    <div className="glass-card p-5 rounded-2xl border border-indigo-950/80 bg-slate-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl border ${isSubscribed ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
          {isSubscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white">
              Desktop & Mobile Push Notifications
            </h4>
            {isSubscribed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Receive instant Chrome / Edge / mobile notification toasts when your visitors arrive, request pass approvals, or exit.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        {isSubscribed ? (
          <>
            <button
              onClick={handleSendTestPush}
              disabled={testLoading}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Test Push
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={loading}
              className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/40 text-xs font-semibold text-rose-300 transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Disable"}
            </button>
          </>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-glow transition-all"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
            Enable Push Notifications
          </button>
        )}
      </div>
    </div>
  );
}

