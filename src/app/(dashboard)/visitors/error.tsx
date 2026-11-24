"use client";

export default function VisitorsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-rose-900 bg-rose-950/40 p-6">
      <h2 className="text-lg font-bold text-text">Could not load visitor information</h2>
      <p className="mt-2 text-sm text-text-muted">Try again. If the problem continues, contact your administrator.</p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
        Try again
      </button>
    </section>
  );
}
