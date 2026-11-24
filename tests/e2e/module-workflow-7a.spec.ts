import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAsE2EAdmin } from "./auth";

for (const viewport of [
  { width: 390, height: 844, label: "mobile" },
  { width: 1440, height: 900, label: "desktop" },
]) {
  test(`7a visitor, reception, and security screens smoke on ${viewport.label}`, async ({ page }) => {
    test.skip(process.env.E2E !== "1", "Run with E2E=1 against a guarded test database.");

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EAdmin(page);

    const screenChecks = [
      { path: "/visitors", heading: "Visitor directory" },
      { path: "/visitors/new", heading: "Register a walk-in" },
      { path: "/checkin", heading: "Reception check-in desk" },
      { path: "/security", heading: "Security gate" },
    ];

    for (const screen of screenChecks) {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { name: screen.heading, level: 1 })).toBeVisible();
      await expect.poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);

      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations.filter((violation) => violation.impact === "critical")
      ).toEqual([]);
    }

    await page.goto("/visitors/new");
    await page.locator("#walkin-name").fill("Playwright Visitor");
    await page.locator("#walkin-phone").fill("+1 555 0100");
    await page.locator("#walkin-email").fill("playwright@example.test");
    await page.locator("#walkin-company").fill("Smoke Test");
    await page.getByRole("button", { name: /continue to host and purpose/i }).click();
    await expect(page.getByRole("heading", { name: "Who are they meeting?" })).toBeVisible();
    await page.getByRole("button", { name: /continue to photo and agreement/i }).click();
    await expect(page.getByRole("heading", { name: "Photo and agreement" })).toBeVisible();
    await expect(page.getByRole("button", { name: /request host approval/i })).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
}
