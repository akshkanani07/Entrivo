"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function InvitationDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Invitation detail page failed:", { errorType: error.name, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <h1 className="text-xl font-bold text-white">Invitation details unavailable</h1>
      <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200">
        The invitation could not be loaded. Try again, or return to the invitation list.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
        <Link href="/invitations" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200">Back to invitations</Link>
      </div>
    </main>
  );
}
