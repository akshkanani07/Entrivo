export default function VisitorProfileLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6" aria-label="Loading visitor profile">
      <div className="h-4 w-40 rounded bg-slate-800" />
      <div className="space-y-2">
        <div className="h-8 w-64 rounded bg-slate-800" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-800" />
      </div>
      <div className="h-48 rounded-2xl border border-slate-800 bg-slate-900/60" />
      <div className="h-12 rounded-xl bg-slate-900/60" />
      <div className="h-64 rounded-2xl border border-slate-800 bg-slate-900/60" />
    </div>
  );
}
