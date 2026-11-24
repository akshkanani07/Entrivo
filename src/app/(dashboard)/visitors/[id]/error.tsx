"use client";

export default function VisitorProfileError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-rose-900 bg-rose-950/40 p-6 text-center">
      <h2 className="text-lg font-bold text-white">Unable to load this visitor profile</h2>
      <p className="mt-2 text-sm text-slate-300">The profile could not be loaded. Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Try again
      </button>
    </div>
  );
}
