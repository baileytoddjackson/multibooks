import { expect, test } from "./fixtures";
import { seedLibrary } from "./seed";

/** The library's titles, in order. Retries until they match (the list loads after the page). */
const expectTitles = (page: import("@playwright/test").Page, titles: string[]) =>
  expect(page.getByTestId("library-entry").getByRole("heading")).toHaveText(titles);

test("the library lists everything, newest first, with clear details", async ({
  page,
  context,
  baseURL,
}) => {
  await seedLibrary(context.request, baseURL!);
  await page.goto("/");
  await page.getByRole("link", { name: "My library", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My library");
  await expect(page.getByText("5 items")).toBeVisible();
  await expectTitles(page, [
    "The Café Under the Hill",
    "Ahab's Second Chance",
    "The Odyssey",
    "Mia and the Bell",
    "Alice's Adventures in Wonderland",
  ]);

  const cafe = page.getByRole("article", { name: "The Café Under the Hill" });
  await expect(cafe).toContainText("Adventure");
  await expect(cafe).toContainText("Alice in Wonderland");
  await expect(cafe).toContainText("2 pages so far · Updated Today");
  const odyssey = page.getByRole("article", { name: "The Odyssey" });
  await expect(odyssey).toContainText("As written");
  await expect(odyssey).toContainText("25% read · Updated 2 days ago");
  await expect(page.getByRole("article", { name: "Mia and the Bell" })).toContainText(
    "Finished · 1 page",
  );
});

test("search, filters and sort narrow the list and stay in the URL", async ({
  page,
  context,
  baseURL,
}) => {
  await seedLibrary(context.request, baseURL!);
  await page.goto("/library");
  await expect(page.getByText("5 items")).toBeVisible();

  await page.getByLabel("Search").fill("cafe");
  await expect(page.getByText("1 of 5 items")).toBeVisible();
  await expectTitles(page, ["The Café Under the Hill"]);
  await expect(page).toHaveURL(/q=cafe/);
  await page.getByLabel("Search").fill("");

  await page.getByText("Adventures", { exact: true }).click();
  await expectTitles(page, ["The Café Under the Hill", "Ahab's Second Chance"]);
  await page.getByLabel("Book", { exact: true }).selectOption("moby-dick");
  await expectTitles(page, ["Ahab's Second Chance"]);
  await expect(page).toHaveURL(/book=moby-dick/);
  await expect(page).toHaveURL(/mode=adventure/);

  // Filters survive a reload.
  await page.reload();
  await expectTitles(page, ["Ahab's Second Chance"]);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("5 items")).toBeVisible();

  await page.getByLabel("Sort by").selectOption("title");
  await expect(page.getByTestId("library-entry").getByRole("heading").first()).toHaveText(
    "Ahab's Second Chance",
  );
  await page.getByLabel("Sort by").selectOption("book");
  await expectTitles(page, [
    "The Café Under the Hill",
    "Alice's Adventures in Wonderland",
    "Ahab's Second Chance",
    "The Odyssey",
    "Mia and the Bell",
  ]);

  await page.getByLabel("Search").fill("dracula");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
});

test("rename, delete and resume from the library", async ({ page, context, baseURL }) => {
  await seedLibrary(context.request, baseURL!);
  await page.goto("/library");

  await page.getByRole("button", { name: "Rename Mia and the Bell" }).click();
  await page.getByLabel("New title").fill("The Bell at Midnight");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("article", { name: "The Bell at Midnight" })).toBeVisible();

  // Deleting asks first; "Keep it" changes nothing.
  await page.getByRole("button", { name: "Delete Ahab's Second Chance" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("article", { name: "Ahab's Second Chance" })).toBeVisible();
  await page.getByRole("button", { name: "Delete Ahab's Second Chance" }).click();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("article", { name: "Ahab's Second Chance" })).toHaveCount(0);

  // Books read as written can be removed too (their place is forgotten).
  await page.getByRole("button", { name: "Remove Alice's Adventures in Wonderland" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("3 items")).toBeVisible();

  // The changes are saved to the account.
  await page.reload();
  await expect(page.getByText("3 items")).toBeVisible();
  await expect(page.getByRole("article", { name: "The Bell at Midnight" })).toBeVisible();

  await page.getByRole("link", { name: "Resume The Café Under the Hill" }).click();
  await expect(page).toHaveURL(/\/story\/11111111-aaaa-4aaa-8aaa-000000000001$/);
  await expect(page.getByText("It went on.")).toBeVisible();
});

test("an empty library points the reader to books and Create Your Own", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Pick a book" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a story" })).toBeVisible();
});

test("the home page shows recent items with a link to the full library", async ({
  page,
  context,
  baseURL,
}) => {
  await seedLibrary(context.request, baseURL!);
  await page.goto("/");
  const stories = page.getByRole("region", { name: "My Stories" });
  await expect(stories.getByRole("link", { name: /Café Under the Hill/ })).toBeVisible();
  await page.getByRole("link", { name: "See all in My library" }).first().click();
  await expect(page).toHaveURL(/\/library\?mode=canon$/);
  await expectTitles(page, ["The Odyssey", "Alice's Adventures in Wonderland"]);
});
