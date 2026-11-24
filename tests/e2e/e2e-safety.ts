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

export function assertE2EDatabaseUrl(value: string | undefined): asserts value is string {
  if (!isAllowedE2EDatabaseUrl(value)) {
    throw new Error(
      "E2E setup refused: set DATABASE_URL to a PostgreSQL test/e2e database; its database name must contain 'test' or 'e2e'."
    );
  }
}
