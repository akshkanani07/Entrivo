import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      JWT_SECRET: "test-jwt-secret-at-least-32-chars-long!",
      APP_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      QR_SIGNING_SECRET: "test-qr-signing-secret-at-least-32-chars!",
      CRON_SECRET: "test-cron-secret",
      STORAGE_SIGNING_SECRET: "test-storage-signing-secret-32-bytes!",
    },
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
      "server-only": path.resolve(process.cwd(), "./tests/shims/server-only.ts"),
    },
  },
});
