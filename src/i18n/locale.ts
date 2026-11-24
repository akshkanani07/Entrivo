export const SUPPORTED_LOCALES = ["en", "gu", "hi"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export function normalizeLocale(value: unknown): Locale | undefined {
  if (typeof value !== "string") return undefined;

  const primaryLanguage = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED_LOCALES.find((locale) => locale === primaryLanguage);
}

function localeFromAcceptLanguage(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;

  const candidates = value
    .split(",")
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1;

      return {
        locale: normalizeLocale(tag),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter(
      (candidate): candidate is { locale: Locale; quality: number; index: number } =>
        candidate.locale !== undefined && candidate.quality > 0
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  return candidates[0]?.locale;
}

export interface LocalePreferences {
  cookieLocale?: string | null;
  userLocale?: string | null;
  visitorLocale?: string | null;
  organizationLocale?: string | null;
  acceptLanguage?: string | null;
}

export function resolveLocale(preferences: LocalePreferences): Locale {
  return (
    normalizeLocale(preferences.cookieLocale) ??
    normalizeLocale(preferences.userLocale) ??
    normalizeLocale(preferences.visitorLocale) ??
    normalizeLocale(preferences.organizationLocale) ??
    localeFromAcceptLanguage(preferences.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
