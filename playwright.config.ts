import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { isAllowedE2EDatabaseUrl } from "./tests/e2e/e2e-safety";

const e2e = process.env.E2E === "1";
const safeE2EDatabase = isAllowedE2EDatabaseUrl(process.env.DATABASE_URL);
if (e2e) {
  process.env.JWT_SECRET ||= randomBytes(48).toString("hex");
  process.env.QR_SIGNING_SECRET ||= randomBytes(32).toString("hex");
  process.env.STORAGE_SIGNING_SECRET ||= randomBytes(32).toString("hex");
  process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: process.env.TEST_APP_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: e2e && !safeE2EDatabase ? undefined : {
    command: e2e ? "pnpm dev" : "pnpm start",
    url: "http://localhost:3000/login",
    reuseExistingServer: !e2e,
    timeout: 60000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
