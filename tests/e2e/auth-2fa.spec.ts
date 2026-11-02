import { test, expect } from "@playwright/test";

test.describe("Authentication, Session & 2FA Workflows", () => {
  test("renders login page with email, password, and compliance notices", async ({ page }) => {
    await page.goto("/login");

    // Form inputs and action button
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verify privacy & terms links
    await expect(page.locator('a[href="/terms"]')).toBeVisible();
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
  });

  test("validates required login fields on form inputs", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await expect(emailInput).toHaveAttribute("required", "");
    await expect(passwordInput).toHaveAttribute("required", "");
  });

  test("rejects invalid credentials without user enumeration", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[type="email"]', "nonexistent.user@entrivo.com");
    await page.fill('input[type="password"]', "WrongPassword123!@#");
    await page.click('button[type="submit"]');

    // Generic error alert displayed
    const alert = page.locator("text=/invalid email or password|please enter your work email|login failed/i");
    await expect(alert.first()).toBeVisible({ timeout: 8000 });
  });
});
