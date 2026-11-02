import { test, expect } from "@playwright/test";

test.describe("Kiosk Terminal Pairing & Touchless Check-In Flow", () => {
  test("renders kiosk pairing screen with code input", async ({ page }) => {
    await page.goto("/kiosk/pair");

    // Heading and pairing input field
    await expect(page.locator("text=/pair kiosk|kiosk pairing|terminal/i").first()).toBeVisible();
    const codeInput = page.locator('input[placeholder*="code" i], input[name="code"]');
    if (await codeInput.isVisible()) {
      await expect(codeInput).toBeEnabled();
    }
  });

  test("renders kiosk public home view when terminal is ready", async ({ page }) => {
    await page.goto("/kiosk");

    // Either displays kiosk welcome or unpaired terminal prompt
    await expect(
      page.locator("text=/welcome|check in|pair this kiosk|scan qr/i").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

