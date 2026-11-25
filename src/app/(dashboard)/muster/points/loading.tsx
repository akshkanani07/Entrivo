import { getTranslations } from "next-intl/server";

export default async function MusterPointsLoading() {
  const t = await getTranslations("muster");
  return (
    <div className="space-y-5" aria-label={t("pointsLoading")}>
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="h-20 animate-pulse rounded-xl bg-surface-glass" />
      <div className="h-64 animate-pulse rounded-xl bg-surface-glass" />
    </div>
  );
}
