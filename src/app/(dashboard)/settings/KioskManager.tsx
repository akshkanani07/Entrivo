"use client";

import React, { useState, useEffect } from "react";
import {
  Tablet,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  Clock,
  ShieldCheck,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { clearOfflineStorage } from "@/lib/offline-db";

interface KioskItem {
  id: string;
  name: string;
  isActive: boolean;
  isPaired: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  hasPendingPairing: boolean;
}

export function KioskManager() {
  const [kiosks, setKiosks] = useState<KioskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pairingModal, setPairingModal] = useState<{
    isOpen: boolean;
    name: string;
    code: string;
    expiresInMinutes: number;
  }>({
    isOpen: false,
    name: "",
    code: "",
    expiresInMinutes: 10,
  });
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
      setShowCreateModal(false);
      setPairingModal({
        isOpen: true,
        name: json.data.name,
        code: json.data.pairingCode,
        expiresInMinutes: json.data.expiresInMinutes || 10,
      });
      setNewName("");
      fetchKiosks();
      toast.success("Kiosk registered! Enter pairing code on the device.");
    } catch {
      toast.error("Failed to create kiosk");
    } finally {
      setCreating(false);
    }
  };

  const handleRepair = async (kiosk: KioskItem) => {
    setRepairingId(kiosk.id);
    try {
      const res = await fetch(`/api/kiosk/${kiosk.id}/repair`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Failed to generate pairing code");
        return;
      }
      setPairingModal({
        isOpen: true,
        name: kiosk.name,
        code: json.data.pairingCode,
        expiresInMinutes: json.data.expiresInMinutes || 10,
      });
      fetchKiosks();
      toast.success("New pairing code generated!");
    } catch {
      toast.error("Failed to generate pairing code");
    } finally {
      setRepairingId(null);
    }
  };

  const handleRevoke = async () => {
    try {
      await clearOfflineStorage();
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

  const copyCode = () => {
    if (!pairingModal.code) return;
    navigator.clipboard.writeText(pairingModal.code);
    setCopied(true);
    toast.success("Pairing code copied to clipboard");
    setTimeout(() => setCopied(false), 3000);
  };

  // Format code for clear display: "1234 - 5678"
  const formattedCode =
    pairingModal.code.length === 8
      ? `${pairingModal.code.slice(0, 4)} - ${pairingModal.code.slice(4)}`
      : pairingModal.code;

  return (
    <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Tablet className="w-5 h-5 text-indigo-400" />
            Lobby Tablet Kiosk Terminals
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            One-time hardware pairing with single-use 8-digit codes, rolling renewal, and tenant isolation.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Register New Kiosk
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
          <p className="text-xs text-slate-400">No kiosks registered yet.</p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Pair an iPad or Android tablet at your lobby reception to allow self-service visitor check-in.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {kiosks.map((kiosk) => (
            <div
              key={kiosk.id}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    !kiosk.isActive
                      ? "bg-rose-950/40 border border-rose-900/40 text-rose-400"
                      : kiosk.isPaired
                      ? "bg-emerald-950/50 border border-emerald-800/50 text-emerald-400"
                      : "bg-amber-950/40 border border-amber-800/40 text-amber-400"
                  }`}
                >
                  <Tablet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{kiosk.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        !kiosk.isActive
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : kiosk.isPaired
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {!kiosk.isActive
                        ? "Revoked"
                        : kiosk.isPaired
                        ? "Active & Paired"
                        : "Pending Pairing"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {kiosk.lastUsedAt
                      ? `Last active: ${new Date(kiosk.lastUsedAt).toLocaleString()}`
                      : "Never used yet"}
                    {kiosk.expiresAt && kiosk.isPaired && (
                      <span className="ml-2 text-slate-600">
                        &bull; Session expires: {new Date(kiosk.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => handleRepair(kiosk)}
                  disabled={repairingId === kiosk.id}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Generate new 8-digit pairing code"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{repairingId === kiosk.id ? "Generating..." : "Re-pair"}</span>
                </button>

                {kiosk.isActive && (
                  <button
                    onClick={() => setRevokeDialog({ isOpen: true, id: kiosk.id, name: kiosk.name })}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-900/30 transition-colors"
                    title="Revoke Kiosk Device"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Register New Kiosk */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-indigo-950 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Tablet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Register Lobby Kiosk</h4>
                <p className="text-[11px] text-slate-400">
                  Assign a friendly location name to this tablet.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateKiosk} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Kiosk Name / Location *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tower B - Main Reception iPad"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm flex items-center gap-2"
                >
                  {creating ? "Registering..." : "Generate Pairing Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Display 8-Digit Pairing Code ONCE */}
      {pairingModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl border border-indigo-500/30 max-w-md w-full p-8 space-y-6 text-center shadow-glow">
            <div className="w-14 h-14 rounded-2xl bg-indigo-950 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto shadow-glow-sm">
              <KeyRound className="w-7 h-7" />
            </div>

            <div>
              <h4 className="text-xl font-black text-white">One-Time Pairing Code</h4>
              <p className="text-xs text-slate-400 mt-1">
                For terminal <strong className="text-indigo-400">{pairingModal.name}</strong>
              </p>
            </div>

            {/* Display code prominently */}
            <div className="p-5 rounded-2xl bg-slate-950 border-2 border-indigo-500/30 space-y-2">
              <div className="font-mono text-3xl font-black tracking-widest text-white selection:bg-indigo-600">
                {formattedCode}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-amber-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Expires in {pairingModal.expiresInMinutes} minutes &bull; Single-use only</span>
              </div>
            </div>

            <div className="text-xs text-slate-400 leading-relaxed text-left bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
              <p className="font-semibold text-slate-200">How to activate your tablet:</p>
              <ol className="list-decimal list-inside text-[11px] text-slate-400 space-y-1">
                <li>Open the tablet browser to <code className="text-indigo-300">/kiosk/pair</code></li>
                <li>Enter the 8-digit code shown above</li>
                <li>The terminal links immediately and begins rolling renewal</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyCode}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-2 transition-all"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setPairingModal({ isOpen: false, name: "", code: "", expiresInMinutes: 10 })}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow-sm transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={revokeDialog.isOpen}
        title="Revoke Kiosk Terminal"
        description={`Are you sure you want to revoke '${revokeDialog.name}'? The tablet will immediately lose access and must be re-paired by an administrator.`}
        confirmText="Revoke Kiosk"
        variant="danger"
        onConfirm={handleRevoke}
        onClose={() => setRevokeDialog({ isOpen: false, id: "", name: "" })}
      />
    </div>
  );
}
