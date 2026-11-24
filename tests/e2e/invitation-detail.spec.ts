import { expect, test } from "@playwright/test";

const invitationId = process.env.E2E_INVITATION_ID;

test.describe("Invitation lifecycle responsive layout", () => {
  for (const width of [390, 1440]) {
    test(`shows the lifecycle and detail sections without page overflow at ${width}px`, async ({ page }) => {
      test.skip(!invitationId, "Set E2E_INVITATION_ID and provide an authenticated Playwright context.");

      await page.setViewportSize({ width, height: 900 });
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
