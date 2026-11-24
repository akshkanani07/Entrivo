import type { ReactNode } from "react";

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "border-emerald-500/30 bg-emerald-950/60 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-950/60 text-amber-300",
  danger: "border-rose-500/30 bg-rose-950/60 text-rose-300",
  info: "border-cyan-500/30 bg-cyan-950/60 text-cyan-300",
  neutral: "border-slate-700 bg-slate-900 text-slate-300",
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-tight ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
