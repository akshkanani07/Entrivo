export function isAllowedE2EDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return false;
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return databaseName.toLowerCase().includes("test") || databaseName.toLowerCase().includes("e2e");
  } catch {
    return false;
  }
}

export function assertE2EDatabaseUrl(e2e: string | undefined, value: string | undefined): string {
  if (e2e !== "1") {
    throw new Error("E2E setup refused: set E2E=1 to run authenticated browser tests.");
  }
  if (typeof value !== "string" || !isAllowedE2EDatabaseUrl(value)) {
    throw new Error(
      "E2E setup refused: E2E_DATABASE_URL is missing or unsafe. Set it to a PostgreSQL database whose name contains 'test' or 'e2e'."
    );
  }
  return value;
}
