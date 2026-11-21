import { expect, test } from "./fixtures";

test("reader activity shows up in password-protected admin stats", async ({ page }) => {
  // Tag this device with a group code, then do a little reading.
  await page.goto("/");
  await page.getByRole("button", { name: "Have a group code?" }).click();
  await page.getByLabel("Group code").fill("E2E-ADMIN");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByTestId("book-card-alice").click();
  await page.getByTestId("mode-canon").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Down the Rabbit-Hole");
  await page.getByRole("button", { name: /Next page/ }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();

  // A full navigation flushes queued events with sendBeacon.
  await page.goto("/admin/stats");
  await expect(page.getByRole("heading", { name: "Pilot stats" })).toBeVisible();
  await page.getByLabel("Admin password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That password didn't match.")).toBeVisible();

  await page.getByLabel("Admin password").fill("test-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("region", { name: "Headline numbers" })).toBeVisible();

  // Filter to this group and check the activity was recorded.
  await page.getByRole("combobox", { name: "Group code" }).selectOption("E2E-ADMIN");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("· group E2E-ADMIN")).toBeVisible();
  const books = page.getByRole("region", { name: "Books selected" });
  await expect(books.getByText("Alice in Wonderland")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Reading mode chosen" }).getByText("Read as written"),
  ).toBeVisible();
  const words = page
    .getByRole("region", { name: "Headline numbers" })
    .getByText("Words read")
    .locator("..");
  await expect(words).not.toContainText(/^Words read0/);

  // Signing out locks it again.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
});

test("events endpoint rejects malformed or free-text data", async ({ request }) => {
  const bad = await request.post("/api/events", { data: { sessionId: "x", events: [] } });
  expect(bad.status()).toBe(400);
  const code = await request.post("/api/events", {
    data: {
      sessionId: "abcdefgh12",
      sessionCode: "jordan smith",
      events: [{ type: "create_started", props: {}, ts: Date.now() }],
    },
  });
  expect(code.status()).toBe(400);
  const ok = await request.post("/api/events", {
    data: {
      sessionId: "abcdefgh12",
      events: [
        { type: "book_selected", props: { bookId: "alice" }, ts: Date.now() },
        { type: "not_a_real_event", props: {}, ts: Date.now() },
      ],
    },
  });
  expect(ok.status()).toBe(204);
});

test("admin pages are not reachable without signing in", async ({ request }) => {
  const res = await request.get("/admin/stats");
  const html = await res.text();
  expect(html).toContain("Admin password");
  expect(html).not.toContain("Headline numbers");
  // Password resets need the admin cookie too.
  const reset = await request.post("/admin/reset-password", {
    form: { email: "anyone@example.com", password: "taken-over-123" },
    maxRedirects: 0,
  });
  expect(reset.headers().location).toMatch(/\/admin\/stats$/);
});

test("an admin can reset a reader's password, which signs them out", async ({
  page,
  account,
  browser,
  baseURL,
}) => {
  await page.goto("/admin/stats");
  await page.getByLabel("Admin password").fill("test-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Reader's email").fill(account.email);
  await page.getByLabel("New password").fill("brand-new-pass");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  // The reader's old session no longer works…
  expect((await page.request.get("/api/me")).status()).toBe(401);
  // …the old password is rejected and the new one works.
  const fresh = await browser.newContext({ baseURL });
  const login = (password: string) =>
    fresh.request.post("/api/auth/login", { data: { email: account.email, password } });
  expect((await login(account.password)).status()).toBe(401);
  expect((await login("brand-new-pass")).ok()).toBe(true);
  await fresh.close();
});
