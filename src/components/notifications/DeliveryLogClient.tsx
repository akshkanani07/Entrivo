"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RotateCcw,
  Filter,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Clock,
  Mail,
  Share2,
  Loader2,
  Calendar,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";

interface NotificationItem {
  id: string;
  channel: string;
  event: string;
  title: string;
  body: string;
  recipient: string | null;
  status: "SENT" | "FAILED" | "PENDING";
  error: string | null;
  retryCount: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  isDeadLetter: boolean;
  createdAt: string;
}

interface ChannelMetric {
  total: number;
  sent: number;
  failed: number;
  deadLetters: number;
  successRate: number;
}

export function DeliveryLogClient() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [metrics, setMetrics] = useState<Record<string, ChannelMetric>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Filters
  const [selectedChannel, setSelectedChannel] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedChannel !== "ALL") params.set("channel", selectedChannel);
      if (selectedStatus === "DEAD_LETTER") {
        params.set("deadLetter", "true");
      } else if (selectedStatus !== "ALL") {
        params.set("status", selectedStatus);
      }
      if (selectedEvent) params.set("event", selectedEvent);
      if (selectedDate) params.set("date", selectedDate);

      const res = await fetch(`/api/notifications/delivery-log?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.data) {
        setItems(data.data.notifications || []);
        setMetrics(data.data.metrics24h || {});
        setTotal(data.data.total || 0);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load delivery log");
    } finally {
      setLoading(false);
    }
  }, [selectedChannel, selectedStatus, selectedEvent, selectedDate]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch("/api/notifications/delivery-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Retry failed");
      }
      toast.success(data.message || "Notification retried successfully");
      await fetchLog();
    } catch (err: any) {
      toast.error(err.message || "Failed to retry notification");
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (item: NotificationItem) => {
    if (item.isDeadLetter) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-950/80 text-purple-400 border-purple-800">
          <AlertOctagon className="w-3 h-3" />
          DEAD LETTER
        </span>
      );
    }
    if (item.status === "SENT") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-950/80 text-emerald-400 border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          SENT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-rose-950/80 text-rose-400 border-rose-800">
        <XCircle className="w-3 h-3" />
        FAILED
      </span>
    );
  };

  const getChannelBadge = (ch: string) => {
    switch (ch) {
      case "EMAIL":
        return "bg-indigo-950/80 text-indigo-400 border-indigo-800";
      case "SLACK":
        return "bg-amber-950/80 text-amber-400 border-amber-800";
      case "TEAMS":
        return "bg-purple-950/80 text-purple-400 border-purple-800";
      case "WEB_PUSH":
        return "bg-cyan-950/80 text-cyan-400 border-cyan-800";
      default:
        return "bg-slate-900 text-slate-400 border-slate-800";
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-5">
      {/* 24-Hour Metrics Bar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            24-Hour Multi-Channel Delivery Metrics
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">Rolling window</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {["EMAIL", "IN_APP", "WEB_PUSH", "SLACK", "TEAMS"].map((ch) => {
            const m = metrics[ch] || { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 };
            return (
              <div
                key={ch}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="font-bold">{ch.replace("_", " ")}</span>
                  <span className={`font-mono font-bold ${m.successRate >= 95 ? "text-emerald-400" : "text-amber-400"}`}>
                    {m.successRate}%
                  </span>
                </div>
                <div className="text-xs text-white font-mono">
                  {m.sent} <span className="text-[10px] text-slate-400">/ {m.total} sent</span>
                </div>
                {m.failed > 0 && (
                  <div className="text-[10px] text-rose-400 font-mono mt-1">
                    {m.failed} failed ({m.deadLetters} dead)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 text-[11px] font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-indigo-400" /> Filter:
          </span>

          {/* Channel selector */}
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
          >
            <option value="ALL">All Channels</option>
            <option value="EMAIL">Email</option>
            <option value="IN_APP">In-App</option>
            <option value="WEB_PUSH">Web Push</option>
            <option value="SLACK">Slack</option>
            <option value="TEAMS">Teams</option>
          </select>

          {/* Status selector */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="SENT">Delivered (Sent)</option>
            <option value="FAILED">Failed</option>
            <option value="DEAD_LETTER">Dead-Letter Queue</option>
          </select>

          {/* Date filter */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
          />
        </div>

        <button
          onClick={fetchLog}
          className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Log ({total})
        </button>
      </div>

      {/* Log Entries Table */}
      <div className="space-y-2.5">
        {loading && items.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            Loading delivery audit records...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No notification logs match your filter criteria.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl bg-slate-900/60 border ${
                item.status === "FAILED" || item.isDeadLetter ? "border-rose-900/50" : "border-slate-800"
              } space-y-2 hover:border-slate-700 transition-colors`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getChannelBadge(item.channel)}`}>
                    {item.channel}
                  </span>
                  <span className="text-xs font-bold text-white">{item.title}</span>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(item)}
                  {(item.status === "FAILED" || item.isDeadLetter) && (
                    <button
                      type="button"
                      onClick={() => handleRetry(item.id)}
                      disabled={retryingId === item.id}
                      className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {retryingId === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Retry (attempt {item.retryCount + 1})
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-300 font-mono whitespace-pre-line bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60 text-[11px] leading-relaxed">
                {item.body}
              </p>

              {item.error && (
                <div className="text-[11px] font-mono text-rose-400 bg-rose-950/30 border border-rose-900/50 p-2 rounded-lg">
                  <strong>Error details:</strong> {item.error}
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                <span>
                  Event: <code className="text-indigo-400">{item.event}</code> • Recipient: {item.recipient || "N/A"}
                </span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

