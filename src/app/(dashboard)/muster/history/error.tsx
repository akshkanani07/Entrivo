"use client";

import { useTranslations } from "next-intl";

export default function MusterHistoryError({ reset }: { reset: () => void }) {
  const t = useTranslations("muster");
  return (
    <section role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 text-sm text-rose-200">
      <p>{t("historyError")}</p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg border border-rose-400/40 px-4 font-bold">
        {t("retry")}
      </button>
    </section>
  );
}
