import { expect, test } from "@playwright/test";

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
});
