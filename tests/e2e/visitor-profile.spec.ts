import { expect, test } from "@playwright/test";

const visitorId = process.env.E2E_VISITOR_ID;

test.describe("Visitor profile responsive layout", () => {
  for (const width of [390, 1440]) {
    test(`shows profile sections without page overflow at ${width}px`, async ({ page }) => {
      test.skip(!visitorId, "Set E2E_VISITOR_ID and provide an authenticated Playwright context.");

      await page.setViewportSize({ width, height: 900 });
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
