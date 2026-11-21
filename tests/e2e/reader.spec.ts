import { expect, test } from "./fixtures";

test("dashboard → book → read as written opens chapter 1", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-card-alice").click();
  await page.getByTestId("mode-canon").click();
  await expect(page).toHaveURL(/\/read\/alice\/1\?mode=canon/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Down the Rabbit-Hole");
  await expect(page.getByText("Alice was beginning to get very tired")).toBeVisible();
});

test("pages turn, progress saves, and reading resumes", async ({ page }) => {
  await page.goto("/read/alice/1?mode=canon");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: /Next page/ }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page).toHaveURL(/page=2/);

  // Leaving and coming back through the dashboard lands on the same page.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Continue reading" })).toBeVisible();
  await page
    .getByRole("link", { name: /Alice in Wonderland/ })
    .first()
    .click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
});

test("last page of a chapter continues to the next chapter", async ({ page }) => {
  await page.goto("/read/alice/1?mode=canon&page=3");
  await page.getByRole("button", { name: /Next chapter/ }).click();
  await expect(page).toHaveURL(/\/read\/alice\/2/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Pool of Tears");
});

test("arrow keys turn pages", async ({ page }) => {
  await page.goto("/read/moby-dick/1?mode=canon");
  await expect(page.getByText(/^Page 1 of/)).toBeVisible();
  // The reader writes ?page= once its effects (including the key listener) are attached.
  await expect(page).toHaveURL(/page=1/);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/^Page 2 of/)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/^Page 1 of/)).toBeVisible();
});

test("text size and theme settings apply and persist", async ({ page }) => {
  await page.goto("/read/odyssey/1?mode=canon");
  await page.getByRole("button", { name: "Text settings" }).click();
  await page.getByRole("button", { name: "Large text" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  const root = page.locator("[data-theme]").first();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-font-size", "l");
  await page.reload();
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "dark");
});

test("contents dialog jumps to a chapter", async ({ page }) => {
  await page.goto("/read/moby-dick/1?mode=canon");
  await page.getByRole("button", { name: /Contents/ }).click();
  const dialog = page.getByRole("dialog", { name: "Contents" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: /Ahab$/ }).first().click();
  await expect(page).toHaveURL(/\/read\/moby-dick\/28/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ahab");
});

test("Sherlock Holmes reads as written, story by story", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-card-sherlock").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The Adventures of Sherlock Holmes",
  );
  await page.getByTestId("mode-canon").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A Scandal in Bohemia");
  await expect(page.getByText(/To Sherlock Holmes she is always/)).toBeVisible();

  // Each story is a chapter in the contents.
  await page.getByRole("button", { name: /Contents/ }).click();
  await expect(page.getByRole("link", { name: /The Red-Headed League/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /The Adventure of the Copper Beeches/ }),
  ).toBeVisible();
});

test("Adventure Mode waits for a book's real content instead of showing placeholders", async ({
  page,
}) => {
  // Sherlock's summaries and entry choice are placeholders until content:summaries and
  // content:maps run with an API key; then this test should be updated.
  await page.goto("/book/sherlock");
  await expect(page.getByTestId("mode-adventure-soon")).toContainText("Coming soon");
  await expect(page.getByTestId("mode-adventure")).toHaveCount(0);
  await page.goto("/read/sherlock/1?mode=adventure");
  await expect(page.getByText("Adventures for this book are still being written")).toBeVisible();
  await expect(page.getByTestId("choice-prompt")).toHaveCount(0);
});
