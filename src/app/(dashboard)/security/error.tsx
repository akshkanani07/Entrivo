"use client";

export default function SecurityError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-rose-900 bg-rose-950/40 p-6">
      <h2 className="text-lg font-bold text-text">Security gate data could not be loaded</h2>
      <p className="mt-2 text-sm text-text-muted">Do not use this screen to approve entry until the latest security checks are visible.</p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
        Try again
      </button>
    </section>
  );
}
