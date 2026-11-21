import { expect, test } from "@playwright/test";
import { E2E_ACCESS_CODE, E2E_PASSWORD, uniqueEmail } from "./fixtures";

/** Signed-out flows: these tests use plain Playwright `test`, with no account made for them. */

test("signed-out readers are sent to sign in, then back where they were going", async ({
  page,
  context,
  baseURL,
}) => {
  const email = uniqueEmail("returning");
  await context.request.post(`${baseURL}/api/auth/signup`, {
    data: { email, password: E2E_PASSWORD, accessCode: E2E_ACCESS_CODE },
  });
  await context.clearCookies();

  await page.goto("/book/alice");
  await expect(page).toHaveURL(/\/login\?next=%2Fbook%2Falice$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("don't match");

  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/book\/alice$/);
});

test("APIs refuse signed-out requests", async ({ request }) => {
  expect((await request.get("/api/me")).status()).toBe(401);
  const detour = await request.post("/api/detour", { data: {} });
  expect(detour.status()).toBe(401);
});

test("an invite link fills in the access code and signs the new reader in", async ({ page }) => {
  await page.goto(`/signup?code=${E2E_ACCESS_CODE.toLowerCase()}`);
  await expect(page.getByLabel("Access code")).toHaveValue(E2E_ACCESS_CODE.toLowerCase());
  // The code is removed from the address bar (and so from history).
  await expect(page).toHaveURL(/\/signup$/);

  const email = uniqueEmail("invited");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick a book");
  // Shown in the header from tablet width up; always in the page.
  await expect(page.getByText(email)).toBeAttached();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign-up needs the right access code", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(uniqueEmail("nocode"));
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByLabel("Access code").fill("NOT-THE-CODE");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("access code isn't right");
  await expect(page).toHaveURL(/\/signup$/);
});

test("an email can only be registered once", async ({ request }) => {
  const data = { email: uniqueEmail("twice"), password: E2E_PASSWORD, accessCode: E2E_ACCESS_CODE };
  expect((await request.post("/api/auth/signup", { data })).ok()).toBe(true);
  const again = await request.post("/api/auth/signup", {
    data: { ...data, email: data.email.toUpperCase() },
  });
  expect(again.status()).toBe(409);
});

test("saved progress follows the account to another device", async ({ browser, baseURL }) => {
  const email = uniqueEmail("two-devices");
  const ipad = await browser.newContext({ baseURL });
  await ipad.request.post("/api/auth/signup", {
    data: { email, password: E2E_PASSWORD, accessCode: E2E_ACCESS_CODE },
  });
  const page = await ipad.newPage();
  await page.goto("/read/alice/1?mode=canon");
  await page.getByRole("button", { name: /Next page/ }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.goto("/"); // leaving the page sends the pending save
  await expect(page.getByRole("heading", { name: "Continue reading" })).toBeVisible();
  await ipad.close();

  const laptop = await browser.newContext({ baseURL });
  await laptop.request.post("/api/auth/login", { data: { email, password: E2E_PASSWORD } });
  const other = await laptop.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("progressbar", { name: "Alice in Wonderland progress" }),
  ).toBeVisible();
  await other.goto("/read/alice");
  await expect(other).toHaveURL(/\/read\/alice\/1\?mode=canon/);
  await expect(other.getByText("Page 2 of")).toBeVisible();
  await laptop.close();
});
