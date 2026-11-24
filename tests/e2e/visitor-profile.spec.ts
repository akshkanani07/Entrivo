import { expect, test } from "@playwright/test";
import { loginAsE2EAdmin } from "./auth";

test.describe("Visitor profile responsive layout", () => {
  for (const width of [360, 1440]) {
    test(`shows profile sections without page overflow at ${width}px`, async ({ page }) => {
      test.skip(process.env.E2E !== "1", "Run with E2E=1 and a guarded test database.");
      const visitorId = process.env.E2E_VISITOR_ID;
      if (!visitorId) throw new Error("E2E visitor was not seeded by Playwright global setup.");

      await page.setViewportSize({ width, height: 900 });
      await loginAsE2EAdmin(page);
      await page.goto(`/visitors/${encodeURIComponent(visitorId!)}`);

      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Visits" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Invitations" })).toBeVisible();

      const pageFitsViewport = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
      expect(pageFitsViewport).toBe(true);
    });
  }
});
