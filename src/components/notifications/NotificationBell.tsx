"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, Check, ExternalLink, Loader2, Mail, ShieldAlert, UserCheck, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationItem {
  id: string;
  channel: string;
  event: string;
  title: string;
  body: string;
  data: any;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      const data = await res.json();
      if (data.success) {
        setUnreadCount(data.count || 0);
      }
    } catch {}
  };

  const fetchRecent = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=8");
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRecent();
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string, url?: string) => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (url) {
        setIsOpen(false);
        router.push(url);
      }
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {}
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "WEB_PUSH":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "EMAIL":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
      case "SLACK":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "TEAMS":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        className="relative p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-glow-sm animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl glass-card border border-indigo-950/80 bg-slate-950/95 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                Loading alerts...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                You&apos;re all caught up! No recent notifications.
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt;
                const targetUrl = n.data?.url || n.data?.qrPassUrl;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleMarkAsRead(n.id, targetUrl)}
                    className={`p-3 text-left transition-colors cursor-pointer hover:bg-slate-900/60 ${
                      isUnread ? "bg-indigo-950/20" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${getChannelBadge(
                            n.channel
                          )}`}
                        >
                          {n.channel.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {n.event.replace("_", " ")}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <h5 className="text-xs font-semibold text-white mt-1">
                      {n.title}
                    </h5>
                    <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5">
                      {n.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2.5 bg-slate-900/50 border-t border-slate-800/80 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1"
            >
              Open Notification Center <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
