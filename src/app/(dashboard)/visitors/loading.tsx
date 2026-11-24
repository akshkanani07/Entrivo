export default function VisitorsLoading() {
  return (
    <div className="space-y-5" aria-label="Loading visitors">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="h-20 animate-pulse rounded-xl bg-surface-glass" />
      <div className="h-14 animate-pulse rounded-xl bg-surface-glass" />
      <div className="h-72 animate-pulse rounded-xl bg-surface-glass" />
    </div>
  );
}
