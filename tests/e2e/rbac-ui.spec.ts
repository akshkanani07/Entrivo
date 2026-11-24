import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __dashboardCLS?: number;
  }
}

test.describe("RBAC UI Navigation & Role Visibility", () => {
  const roleCredentials = [
    { role: "security guard", email: "security@entrivo.com", heading: "Security dashboard", hidden: "Settings" },
    { role: "receptionist", email: "reception@entrivo.com", heading: "Reception dashboard", hidden: "Analytics" },
    { role: "employee", email: "alex.morgan@entrivo.com", heading: "My visitors", hidden: "Settings" },
    { role: "organization admin", email: "admin@entrivo.com", heading: "Workplace dashboard", hidden: "" },
  ];

  for (const account of roleCredentials) {
    test(`role dashboard: ${account.role} on mobile and desktop`, async ({ page }) => {
      const password = process.env.SEED_ADMIN_PASSWORD;
      test.skip(!password, "SEED_ADMIN_PASSWORD is required for role-shell login tests");

      await page.addInitScript(() => {
        window.__dashboardCLS = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
            if (!entry.hadRecentInput) window.__dashboardCLS = (window.__dashboardCLS || 0) + entry.value;
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/login");
      await page.locator("#login-email").fill(account.email);
      await page.locator("#login-password").fill(password!);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => url.pathname === "/");
      await expect(page.getByRole("heading", { name: account.heading, level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => { window.__dashboardCLS = 0; });
      await page.waitForTimeout(1000);
      const mobileCls = await page.evaluate(() => window.__dashboardCLS || 0);
      expect(mobileCls).toBeLessThan(0.1);

      await expect(page.getByRole("navigation", { name: "Mobile primary navigation" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open mobile navigation menu" })).toBeVisible();
      await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
      await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.getByRole("button", { name: "Open mobile navigation menu" }).click();
      await expect(page.getByRole("complementary", { name: "Mobile navigation" })).toBeVisible();
      await page.getByRole("button", { name: "Close menu" }).click();

      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.getByRole("heading", { name: account.heading, level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Mobile primary navigation" })).toBeHidden();
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      if (account.hidden) {
        await expect(page.getByRole("link", { name: account.hidden, exact: true })).toHaveCount(0);
      }
    });
  }
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
