/**
 * Secure application URL resolver.
 * Replaces hardcoded localhost fallbacks. Throws in production if missing.
 */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL CONFIGURATION ERROR: NEXT_PUBLIC_APP_URL environment variable is required in production."
      );
    }
    return "http://localhost:3000";
  }
  return url.replace(/\/+$/, "");
}
