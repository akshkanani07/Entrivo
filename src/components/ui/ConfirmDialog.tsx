"use client";

import React, { useEffect, useRef } from "react";
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
  confirmDisabled?: boolean;
  children?: React.ReactNode;
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
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const isLoadingRef = useRef(isLoading);
  onCloseRef.current = onClose;
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoadingRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md animate-in fade-in duration-200 sm:p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-brand/20 bg-surface p-5 shadow-card animate-in zoom-in-95 duration-200 sm:p-6"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl border flex-shrink-0 ${colorConfig.bg}`}>
            {colorConfig.icon}
          </div>

          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="text-base font-bold tracking-tight text-text">{title}</h3>
            <p id="confirm-dialog-description" className="mt-1.5 text-sm leading-relaxed text-text-muted">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close confirmation dialog"
            className="p-1 text-slate-500 hover:text-slate-300 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children && <div className="mt-5">{children}</div>}

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-800/80">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="min-h-11 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
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
