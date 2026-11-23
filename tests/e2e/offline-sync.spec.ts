import { test, expect } from "@playwright/test";

test.describe("PWA, Service Worker & Offline Capability", () => {
  test("renders offline fallback page when disconnected", async ({ page }) => {
    await page.goto("/offline");

    // Verify offline banner and message
    await expect(page.locator("text=/offline|connection offline/i").first()).toBeVisible();
  });

  test("verifies web manifest exists with valid PWA configuration", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBe(true);

    const manifest = await res.json();
    expect(manifest.name).toContain("Entrivo");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
