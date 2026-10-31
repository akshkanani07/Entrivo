"use client";

import React, { useState, useEffect } from "react";
import {
  Tablet,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Key,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface KioskItem {
  id: string;
  name: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function KioskManager() {
  const [kiosks, setKiosks] = useState<KioskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeDialog, setRevokeDialog] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: "",
    name: "",
  });

  const fetchKiosks = async () => {
    try {
      const res = await fetch("/api/kiosk");
      const json = await res.json();
      if (json.success) {
        setKiosks(json.data);
      }
    } catch {
      toast.error("Failed to load kiosk terminals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKiosks();
  }, []);

  const handleCreateKiosk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Failed to create kiosk");
        return;
      }
      setCreatedKey(json.data.rawKey);
      setNewName("");
      fetchKiosks();
      toast.success("Kiosk created successfully");
    } catch {
      toast.error("Failed to create kiosk");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    try {
      const res = await fetch(`/api/kiosk/${revokeDialog.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Kiosk '${revokeDialog.name}' revoked`);
        fetchKiosks();
      } else {
        toast.error(json.error || "Failed to revoke kiosk");
      }
    } catch {
      toast.error("Failed to revoke kiosk");
    } finally {
      setRevokeDialog({ isOpen: false, id: "", name: "" });
    }
  };

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success("Kiosk Key copied to clipboard");
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Tablet className="w-5 h-5 text-indigo-400" />
            Lobby Tablet Kiosk Terminals
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographically paired hardware kiosks with per-key rate limits and tenant isolation.
          </p>
        </div>
        <button
          onClick={() => {
            setCreatedKey(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Pair New Kiosk
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center items-center text-xs text-slate-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          Loading terminals...
        </div>
      ) : kiosks.length === 0 ? (
        <div className="py-10 text-center space-y-3">
          <Tablet className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400">No kiosks paired yet.</p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Pair an iPad or Android tablet at your lobby reception to allow self-service visitor check-in.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {kiosks.map((kiosk) => (
            <div
              key={kiosk.id}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    kiosk.isActive
                      ? "bg-emerald-950/50 border border-emerald-800/50 text-emerald-400"
                      : "bg-slate-900 border border-slate-800 text-slate-500"
                  }`}
                >
                  <Tablet className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{kiosk.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        kiosk.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {kiosk.isActive ? "Active" : "Revoked"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {kiosk.lastUsedAt
                      ? `Last active: ${new Date(kiosk.lastUsedAt).toLocaleString()}`
                      : "Never used"}
                  </p>
                </div>
              </div>

              {kiosk.isActive && (
                <button
                  onClick={() => setRevokeDialog({ isOpen: true, id: kiosk.id, name: kiosk.name })}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Revoke Kiosk"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Key Display Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5">
            {!createdKey ? (
              <form onSubmit={handleCreateKiosk} className="space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-400" />
                  Pair New Kiosk Terminal
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter a descriptive name for this terminal (e.g. &ldquo;Lobby Reception iPad #1&rdquo;). A unique cryptographic secret key will be generated.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Terminal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Front Gate Terminal"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                  >
                    {creating ? "Generating..." : "Generate Secret Key"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                  <h4 className="text-sm font-bold text-white">Kiosk Key Generated</h4>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Copy this key immediately. For security, it is stored as a SHA-256 hash on the server and will <strong>never be shown again</strong>.
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Secret Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdKey}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-400 select-all"
                    />
                    <button
                      type="button"
                      onClick={copyKey}
                      className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center justify-center transition-all"
                      title="Copy Key"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">How to Pair Kiosk Device:</p>
                  <p>1. Open <code className="text-indigo-400">/kiosk</code> on the lobby tablet.</p>
                  <p>2. Paste this secret key into the pairing prompt.</p>
                  <p>3. The key is securely saved in the tablet&apos;s sessionStorage.</p>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedKey(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={revokeDialog.isOpen}
        onClose={() => setRevokeDialog({ isOpen: false, id: "", name: "" })}
        onConfirm={handleRevoke}
        title="Revoke Kiosk Terminal?"
        description={`Are you sure you want to revoke '${revokeDialog.name}'? The tablet will immediately lose access and will not be able to process visitor check-ins.`}
        confirmLabel="Revoke Kiosk"
        variant="danger"
      />
    </div>
  );
}

