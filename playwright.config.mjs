import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/traces",
  timeout: 35000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { trace: "retain-on-failure" },
  webServer: { command: "node tests/server.mjs", port: 4173, reuseExistingServer: false }
});
