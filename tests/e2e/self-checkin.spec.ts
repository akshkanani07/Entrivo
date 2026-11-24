import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("visitor follows mobile self-check-in through confirmation and live status", async ({ page }) => {
  let statusPolls = 0;
  await page.route("**/api/public/self-checkin", async (route) => {
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === "start") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            sessionToken: "a".repeat(43),
            allowWalkIn: false,
            hosts: [{ id: "host-1", name: "Alex Host" }],
            requirements: {
              requireCompany: false,
              requirePhone: false,
              requirePurpose: false,
              requireIdProof: false,
              requireIdNumber: false,
              requirePhoto: false,
              requireNda: false,
              requireHost: true,
            },
          },
        },
      });
      return;
    }
    if (body.action === "identify") {
      await route.fulfill({ json: { success: true, data: { method: "PREREG_QR", hostName: "Alex Host", needsNda: false } } });
      return;
    }
    if (body.action === "submit") {
      await route.fulfill({ json: { success: true, data: { status: "AWAITING_CONFIRMATION", waitingFor: "Alex Host" } } });
      return;
    }
    if (body.action === "status") {
      statusPolls++;
      await route.fulfill({
        json: {
          success: true,
          data: statusPolls > 1
            ? { status: "COMPLETED", badgeNumber: "B-104" }
            : { status: "AWAITING_CONFIRMATION", hostName: "Alex Host" },
        },
      });
      return;
    }
    await route.fulfill({ status: 400, json: { success: false } });
  });

  await page.addInitScript(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}#deskToken=rotating-test-token`);
    }
  });
  await page.goto("/self-checkin#deskToken=rotating-test-token");
  await expect(page.getByText("Visitor self check-in")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan personal pass QR" })).toBeVisible();
  await page.getByLabel("Invitation code or pass").fill("personal-pass-token");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Host: Alex Host")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit for confirmation" }).click();
  await expect(page.getByText("Waiting for confirmation")).toBeVisible();
  await expect(page.getByText("Confirmed. Please proceed to reception.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Badge number:").locator("..")).toContainText("B-104");
});
