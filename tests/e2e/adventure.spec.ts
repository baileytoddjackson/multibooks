import { expect, test, type Page } from "./fixtures";

/** Turns pages until the entry choice appears (it's somewhere in chapter 1). */
export async function readToEntryChoice(page: Page, opts: { navigate?: boolean } = {}) {
  if (opts.navigate !== false) await page.goto("/read/alice/1?mode=adventure");
  await expect(page).toHaveURL(/page=1/);
  for (let i = 0; i < 6; i++) {
    const choice = page.getByText("how do you want to play?", { exact: false });
    if (await choice.isVisible()) return;
    await page.getByRole("button", { name: /Next page/ }).click();
  }
  await expect(page.getByText("how do you want to play?", { exact: false })).toBeVisible();
}

/** From the entry choice: direct the story, pick the first option. Returns its label. */
export async function startAdventure(page: Page): Promise<string> {
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();
  const options = page.getByTestId("choice-prompt").getByRole("listitem");
  await expect(options).toHaveCount(3);
  const label = (await options.first().innerText()).replace("✦", "").trim();
  await options.first().getByRole("button").click();
  return label;
}

test("book → adventure: the story leaves the original text and keeps going", async ({ page }) => {
  await page.goto("/book/alice");
  await page.getByTestId("mode-adventure").click();
  await expect(page).toHaveURL(/mode=adventure/);

  // Already on the reader: don't start a second navigation to the same URL.
  await readToEntryChoice(page, { navigate: false });
  // The page can't be turned past the choice.
  await expect(page.getByRole("button", { name: /Next (page|chapter)/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();
  // The choice says up front that it's one-way.
  const prompt = page.getByTestId("choice-prompt");
  await expect(prompt).toContainText("won't go back to the original");
  await prompt.getByRole("listitem").first().getByRole("button").click();
  await expect(page).toHaveURL(/\/story\//);
});

test("an adventure is its own story: first page, choices, keep going, undo", async ({ page }) => {
  await readToEntryChoice(page);
  // The last line of the original before the choice…
  const lastOriginal = (await page.locator("article p[id]").last().innerText()).trim();
  const label = await startAdventure(page);

  // A new story page, not the book reader.
  await expect(page).toHaveURL(/\/story\/[0-9a-f-]+$/);
  // …is still there, unchanged, at the top: the story reads on up to the decision.
  const lead = page.getByTestId("adventure-lead");
  await expect(lead).toContainText("From the book");
  await expect(lead).toContainText(lastOriginal);
  await expect(
    page.getByText("✦ An adventure from Alice's Adventures in Wonderland"),
  ).toBeVisible();
  await expect(page.getByText(`You chose: ${label}`)).toBeVisible();
  // The mock provider writes a first page that names the choice, and a title.
  await expect(page.getByText("the story leaves the book here")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Alice in Wonderland: A New Path",
  );

  // No way back to the book's text from inside the adventure.
  await expect(page.getByRole("link", { name: /original|as written/i })).toHaveCount(0);

  const choices = page.getByTestId("cyo-choices");
  await expect(choices.getByRole("button")).toHaveCount(2);
  await choices.getByRole("button").first().click();
  await expect(page.getByText("The book never went this way")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Adventure · Alice in Wonderland · Page 2/)).toBeVisible();

  // Undo goes back one choice, but never past the first page.
  await page.getByRole("button", { name: /Go back one choice/ }).click();
  await expect(page.getByText("The book never went this way")).toHaveCount(0);
  await expect(page.getByText("the story leaves the book here")).toBeVisible();
  await expect(page.getByRole("button", { name: /Go back one choice/ })).toHaveCount(0);
});

test("adventures are saved and resume where they left off", async ({ page }) => {
  await readToEntryChoice(page);
  await startAdventure(page);
  await expect(page.getByText("the story leaves the book here")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("cyo-choices").getByRole("button").first().click();
  await expect(page.getByText("The book never went this way")).toBeVisible({ timeout: 15_000 });
  // Text shows while it streams; the page is saved once it's finished (undo appears then).
  await expect(page.getByRole("button", { name: /Go back one choice/ })).toBeVisible();
  const url = page.url();

  await page.goto("/");
  const card = page.getByRole("link", { name: /Alice in Wonderland: A New Path/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Adventure · Alice in Wonderland");
  await card.click();
  await expect(page).toHaveURL(url);
  await expect(page.getByText("The book never went this way")).toBeVisible();
});

test("reading the original instead switches to the book as written", async ({ page }) => {
  await readToEntryChoice(page);
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Read the original instead" }).click();
  await expect(page).toHaveURL(/mode=canon/);
  await expect(page.getByTestId("choice-prompt")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Next (page|chapter)/ })).toBeEnabled();
});

test("be a character: pick a character and see their options", async ({ page }) => {
  await readToEntryChoice(page);
  await page.getByRole("radio", { name: /Be a character/ }).click();
  await page
    .getByRole("group", { name: "Who do you want to be?" })
    .getByRole("radio")
    .first()
    .click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page.getByTestId("choice-prompt")).toBeVisible();
  await expect(page.getByTestId("choice-prompt").getByRole("listitem")).toHaveCount(2);
});

test("style picker works from the keyboard (one tab stop, arrow keys move)", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "WebKit doesn't Tab to form controls by default (a macOS setting)",
  );
  await readToEntryChoice(page);
  const direct = page.getByRole("radio", { name: /Direct the story/ });
  await direct.focus();
  await page.keyboard.press("Space");
  await expect(direct).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Be a character/ })).toBeChecked();
  await expect(page.getByRole("group", { name: "Who do you want to be?" })).toBeVisible();
});

test("adventure mode on a later chapter goes back to the opening", async ({ page }) => {
  await page.goto("/read/alice/5?mode=adventure");
  await expect(page).toHaveURL(/\/read\/alice\/1\?mode=adventure/);
});
