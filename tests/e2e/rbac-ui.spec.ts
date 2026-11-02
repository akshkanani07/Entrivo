import { test, expect } from "@playwright/test";

test.describe("RBAC UI Navigation & Role Visibility", () => {
  test("displays 403 Forbidden page on unauthorized access", async ({ page }) => {
    await page.goto("/forbidden");

    // Forbidden notification and return to dashboard / login link
    await expect(page.locator("text=/permission denied|access restricted/i").first()).toBeVisible();
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });

  test("redirects unauthenticated users attempting to access settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects unauthenticated users attempting to access audit logs", async ({ page }) => {
    await page.goto("/audit-logs");
    await expect(page).toHaveURL(/\/login/);
  });

  test("renders public developer portal with recipes and guides", async ({ page }) => {
    await page.goto("/developers");

    // Developer documentation header
    await expect(page.locator("text=/developer hub|openapi/i").first()).toBeVisible();
    // Verify OpenAPI link or section
    await expect(page.locator('a[href*="openapi.json"]').first()).toBeVisible();
  });

  test("renders public legal documents (/terms and /privacy)", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("text=/terms of service|terms & conditions/i").first()).toBeVisible();

    await page.goto("/privacy");
    await expect(page.locator("text=/privacy policy|data protection/i").first()).toBeVisible();
  });
});
