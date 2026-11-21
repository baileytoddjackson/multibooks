import { expect, test } from "./fixtures";

test("dashboard shows the four books and Create Your Own", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick a book");
  for (const id of ["alice", "odyssey", "moby-dick", "sherlock"]) {
    await expect(page.getByTestId(`book-card-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("create-card")).toBeVisible();
  // No saved progress yet → no Continue row.
  await expect(page.getByRole("heading", { name: "Continue reading" })).toHaveCount(0);
});

test("saved progress appears in Continue reading", async ({ page, context, baseURL }) => {
  // Progress is saved to the account, so seed it through the API.
  const res = await context.request.put(`${baseURL}/api/me/books/odyssey`, {
    data: {
      bookId: "odyssey",
      mode: "canon",
      position: "c001p004",
      fraction: 0.3,
      wordsRead: 500,
      updatedAt: Date.now(),
    },
  });
  expect(res.status()).toBe(204);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Continue reading" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "The Odyssey progress" })).toBeVisible();
});

test("choosing a book offers both reading modes", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-card-moby-dick").click();
  await expect(page).toHaveURL(/\/book\/moby-dick$/);
  await expect(page.getByTestId("mode-canon")).toHaveAttribute(
    "href",
    "/read/moby-dick?mode=canon",
  );
  await expect(page.getByTestId("mode-adventure")).toHaveAttribute(
    "href",
    "/read/moby-dick?mode=adventure",
  );
});

test("session code can be saved without any personal info", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Have a group code?" }).click();
  await page.getByLabel("Group code").fill("lib-oct20");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Group code: LIB-OCT20" })).toBeVisible();
});
