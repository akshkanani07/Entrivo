"use client";

import React from "react";
import { AlertTriangle, Trash2, CheckCircle2, X, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  confirmText,
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const resolvedConfirmLabel = confirmLabel || confirmText || "Confirm";

  const colorConfig = {
    danger: {
      bg: "bg-rose-950/80 border-rose-500/40 text-rose-400",
      btn: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40",
      icon: <Trash2 className="w-5 h-5" />,
    },
    warning: {
      bg: "bg-amber-950/80 border-amber-500/40 text-amber-400",
      btn: "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40",
      icon: <AlertTriangle className="w-5 h-5" />,
    },
    primary: {
      bg: "bg-indigo-950/80 border-indigo-500/40 text-indigo-400",
      btn: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40",
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-6 overflow-hidden glass-card rounded-2xl border border-indigo-500/20 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl border flex-shrink-0 ${colorConfig.bg}`}>
            {colorConfig.icon}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 text-slate-500 hover:text-slate-300 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 ${colorConfig.btn}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{resolvedConfirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
