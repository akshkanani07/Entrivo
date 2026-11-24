import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export function NextStepHint({
  title = "Next step",
  children,
  href,
  actionLabel,
}: {
  title?: string;
  children: ReactNode;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{title}</p>
        <div className="mt-1 text-sm text-text-muted">{children}</div>
      </div>
      {href && actionLabel && (
        <Link
          href={href}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
        >
          {actionLabel}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      )}
    </aside>
  );
}
