"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE_NAME,
  themePreferenceSchema,
  type ThemePreference,
} from "@/lib/theme";

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function applyTheme(preference: ThemePreference) {
  const resolvedTheme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : preference;

  document.documentElement.dataset.theme = resolvedTheme;
}

/** Usage: place in the shared header to cycle between system, light, and dark themes. */
export function ThemeToggle({
  initialTheme = DEFAULT_THEME_PREFERENCE,
}: {
  initialTheme?: ThemePreference;
}) {
  const t = useTranslations("common");
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    if (theme !== "system") return;

    const colorScheme = window.matchMedia("(prefers-color-scheme: light)");
    const updateTheme = () => applyTheme("system");
    colorScheme.addEventListener("change", updateTheme);

    return () => colorScheme.removeEventListener("change", updateTheme);
  }, [theme]);

  const nextTheme = NEXT_THEME[theme];
  const themeLabels: Record<ThemePreference, string> = {
    system: t("theme.system"),
    light: t("theme.light"),
    dark: t("theme.dark"),
  };
  const label = themeLabels[theme];
  const nextLabel = themeLabels[nextTheme];
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  const cycleTheme = () => {
    const preference = themePreferenceSchema.parse(nextTheme);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";

    document.cookie = `${THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    applyTheme(preference);
    setTheme(preference);
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={t("themeToggleLabel", { current: label, next: nextLabel })}
      title={t("themeTitle", { current: label })}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:bg-surface-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
