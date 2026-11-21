import { test as base, expect } from "@playwright/test";

/** The access code the e2e servers run with (playwright.config.ts). */
export const E2E_ACCESS_CODE = "E2E-CODE";
export const E2E_PASSWORD = "reading-is-fun";

let counter = 0;
export function uniqueEmail(prefix = "reader") {
  return `${prefix}-${Date.now()}-${process.pid}-${counter++}@example.com`;
}

/**
 * `test` with a fresh signed-in account per test, so every test starts with an empty library
 * (just as each test used to start with empty localStorage). The context's request client
 * shares its cookie jar, so signing up through the API signs the browser in too.
 */
export const test = base.extend<{ account: { email: string; password: string } }>({
  account: async ({ context, baseURL }, provide) => {
    const email = uniqueEmail();
    const res = await context.request.post(`${baseURL}/api/auth/signup`, {
      data: { email, password: E2E_PASSWORD, accessCode: E2E_ACCESS_CODE },
    });
    expect(res.ok(), await res.text()).toBe(true);
    await provide({ email, password: E2E_PASSWORD });
  },
  // Every test that uses a page gets an account first.
  page: async ({ page, account }, provide) => {
    void account;
    await provide(page);
  },
});

export { expect };
export type { Page } from "@playwright/test";
