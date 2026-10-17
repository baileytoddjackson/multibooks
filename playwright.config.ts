import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    { name: "phone-390", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
    {
      name: "ipad-820",
      use: { ...devices["iPad (gen 7)"], viewport: { width: 820, height: 1180 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { LLM_PROVIDER: "mock", DATABASE_URL: "file:./data/e2e.db", ADMIN_PASSWORD: "test-admin" },
  },
});
