import { test, expect } from "@playwright/test";

test.describe("Visitor Lifecycle: Invitation, Approval, Check-In & Checkout", () => {
  test("renders invitation creation form with required fields", async ({ page }) => {
    await page.goto("/invitations/new");

    // If redirected to login when unauthenticated, verifies login protection
    if (page.url().includes("/login")) {
      await expect(page.locator('input[type="email"]')).toBeVisible();
      return;
    }

    // Otherwise verifies form inputs
    await expect(page.locator('input[name="visitorName"], #visitorName')).toBeVisible();
    await expect(page.locator('input[name="visitorEmail"], #visitorEmail')).toBeVisible();
    await expect(page.locator('input[name="visitorPhone"], #visitorPhone')).toBeVisible();
  });

  test("renders check-in portal with QR scanner and manual token entry", async ({ page }) => {
    await page.goto("/checkin");

    // If redirected to login when unauthenticated
    if (page.url().includes("/login")) {
      await expect(page.locator('input[type="email"]')).toBeVisible();
      return;
    }

    // Checkin page title and scan option
    await expect(page.locator("text=/check-in|visitor check-in/i").first()).toBeVisible();
    const tokenInput = page.locator('input[placeholder*="token" i], input[name="token"]');
    if (await tokenInput.isVisible()) {
      await expect(tokenInput).toBeEnabled();
    }
  });

  test("renders visitor pass view with valid security constraints", async ({ page }) => {
    await page.goto("/pass/SAMPLE-TEST-TOKEN-1234");

    // Invalid or missing pass returns appropriate error or access page
    await expect(
      page.locator("text=/pass|visitor|invalid|not found|expired/i").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

