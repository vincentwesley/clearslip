import { defineConfig } from "@playwright/test";

// Store screenshots only; the default `npx playwright test` config points at tests/e2e and never sees this.
export default defineConfig({
  testDir: ".",
  testMatch: "shots.spec.ts",
  timeout: 180000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/store",
});
