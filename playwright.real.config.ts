import { defineConfig } from "@playwright/test";

// Live-web check, run only via `npm run test:real`. Never part of `npx playwright test` or CI.
export default defineConfig({
  testDir: "tests/real",
  testMatch: "**/*.spec.ts",
  timeout: 240000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results/real",
});
