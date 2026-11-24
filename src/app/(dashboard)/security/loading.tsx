export default function SecurityLoading() {
  return (
    <div className="space-y-5" aria-label="Loading security gate">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="h-16 animate-pulse rounded-xl bg-surface-glass" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl bg-surface-glass" />
        <div className="h-72 animate-pulse rounded-xl bg-surface-glass" />
      </div>
    </div>
  );
}
