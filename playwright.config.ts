import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Second server with the daily budget at $0, to test the "story machine is resting" state. */
const BUDGET_OFF_PORT = 3101;

const baseEnv = { LLM_PROVIDER: "mock", ADMIN_PASSWORD: "test-admin" };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    {
      name: "phone-390",
      testIgnore: /budget\.spec/,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "ipad-820",
      testIgnore: /budget\.spec/,
      use: { ...devices["iPad (gen 7)"], viewport: { width: 820, height: 1180 } },
    },
    {
      name: "desktop-1280",
      testIgnore: /budget\.spec/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "budget-off",
      testMatch: /budget\.spec/,
      use: {
        ...devices["iPad (gen 7)"],
        viewport: { width: 820, height: 1180 },
        baseURL: `http://localhost:${BUDGET_OFF_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ...baseEnv, DATABASE_URL: "file:./data/e2e.db" },
    },
    {
      // Reuses the build above: waits for the first server, then starts a second instance.
      command: `until curl -s http://localhost:${PORT} >/dev/null; do sleep 1; done; npx next start -p ${BUDGET_OFF_PORT}`,
      url: `http://localhost:${BUDGET_OFF_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { ...baseEnv, DATABASE_URL: "file:./data/e2e-budget.db", DAILY_BUDGET_USD: "0" },
    },
  ],
});
