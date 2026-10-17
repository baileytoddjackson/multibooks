import { expect, test } from "@playwright/test";

test("dashboard shows the three books and Create Your Own", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick a book");
  for (const id of ["alice", "odyssey", "moby-dick"]) {
    await expect(page.getByTestId(`book-card-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("create-card")).toBeVisible();
  // No saved progress yet → no Continue row.
  await expect(page.getByRole("heading", { name: "Continue reading" })).toHaveCount(0);
});

test("saved progress appears in Continue reading", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "multibooks:v1:books",
      JSON.stringify({
        odyssey: {
          bookId: "odyssey",
          mode: "canon",
          position: "c01p004",
          fraction: 0.3,
          wordsRead: 500,
          updatedAt: Date.now(),
        },
      }),
    ),
  );
  await page.reload();
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
