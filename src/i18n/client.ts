import type { Locale } from "./locale";

export async function persistLocalePreference(locale: Locale): Promise<void> {
  const response = await fetch("/api/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });
  const result: unknown = await response.json();
  const message =
    result && typeof result === "object" && "message" in result && typeof result.message === "string"
      ? result.message
      : undefined;

  if (
    !response.ok ||
    !result ||
    typeof result !== "object" ||
    !("success" in result) ||
    result.success !== true
  ) {
    throw new Error(message || "LOCALE_CHANGE_FAILED");
  }
}
