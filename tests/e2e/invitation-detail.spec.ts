import { expect, test } from "@playwright/test";
import { loginAsE2EAdmin } from "./auth";

test.describe("Invitation lifecycle responsive layout", () => {
  for (const width of [390, 1440]) {
    test(`shows the lifecycle and detail sections without page overflow at ${width}px`, async ({ page }) => {
      test.skip(process.env.E2E !== "1", "Run with E2E=1 and a guarded test database.");
      const invitationId = process.env.E2E_INVITATION_ID;
      if (!invitationId) throw new Error("E2E invitation was not seeded by Playwright global setup.");

      await page.setViewportSize({ width, height: 900 });
      await loginAsE2EAdmin(page);
      await page.goto(`/invitations/${encodeURIComponent(invitationId!)}`);

      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Invitation detail sections" })).toBeVisible();
      for (const step of ["Invited", "Pre-registered", "Approved", "Arrived", "Meeting", "Checked out", "Feedback"]) {
        await expect(page.getByText(step, { exact: true }).first()).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: "Visit details" })).toBeVisible();

      const pageFitsViewport = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
      expect(pageFitsViewport).toBe(true);
    });
  }
});
