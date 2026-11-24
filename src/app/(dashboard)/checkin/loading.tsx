export default function CheckinLoading() {
  return (
    <div className="space-y-5" aria-label="Loading check-in desk">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="h-16 animate-pulse rounded-xl bg-surface-glass" />
      <div className="h-72 animate-pulse rounded-xl bg-surface-glass" />
    </div>
  );
}
