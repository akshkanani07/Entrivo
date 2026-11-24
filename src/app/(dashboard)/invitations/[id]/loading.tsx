export default function InvitationDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse space-y-6 p-4 sm:p-8" aria-label="Loading invitation details">
      <div className="h-4 w-40 rounded bg-slate-800" />
      <div className="h-8 w-64 rounded bg-slate-800" />
      <div className="h-32 rounded-2xl border border-slate-800 bg-slate-900/60" />
      <div className="h-10 rounded-xl bg-slate-900/60" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-2xl border border-slate-800 bg-slate-900/60" />
        <div className="h-72 rounded-2xl border border-slate-800 bg-slate-900/60" />
      </div>
    </main>
  );
}
