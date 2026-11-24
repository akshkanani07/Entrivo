import { describe, expect, it } from "vitest";
import { normalizeLocale, resolveLocale } from "@/i18n/locale";

describe("locale resolution", () => {
  it("normalizes legacy and regional locale values without rewriting stored data", () => {
    expect(normalizeLocale("en-IN")).toBe("en");
    expect(normalizeLocale("gu-IN")).toBe("gu");
    expect(normalizeLocale("fr-FR")).toBeUndefined();
  });

  it("uses the configured preference order and falls back to Accept-Language", () => {
    expect(
      resolveLocale({
        cookieLocale: "hi",
        userLocale: "gu",
        visitorLocale: "gu",
        organizationLocale: "en-IN",
        acceptLanguage: "en-US",
      })
    ).toBe("hi");
    expect(
      resolveLocale({
        userLocale: "gu-IN",
        visitorLocale: "hi",
        organizationLocale: "en-IN",
        acceptLanguage: "en-US",
      })
    ).toBe("gu");
    expect(
      resolveLocale({
        organizationLocale: "en-IN",
        acceptLanguage: "hi-IN",
      })
    ).toBe("en");
    expect(resolveLocale({ acceptLanguage: "fr-FR, hi-IN;q=0.8" })).toBe("hi");
  });

  it("respects Accept-Language quality values and defaults to English", () => {
    expect(resolveLocale({ acceptLanguage: "gu-IN;q=0.4, hi-IN;q=0.9" })).toBe("hi");
    expect(resolveLocale({ acceptLanguage: "fr-FR, *;q=0.2" })).toBe("en");
  });
});
