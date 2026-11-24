import { expect, type Page } from "@playwright/test";

export async function loginAsE2EAdmin(page: Page): Promise<void> {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E admin credentials were not seeded by Playwright global setup.");
  }

  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}
