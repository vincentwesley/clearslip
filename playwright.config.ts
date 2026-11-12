import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
});
