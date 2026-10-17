import { expect, test, type Page } from "@playwright/test";

/** Turns pages until the first choice appears (the intro choice is somewhere in chapter 1). */
async function readToFirstChoice(page: Page, opts: { navigate?: boolean } = {}) {
  if (opts.navigate !== false) await page.goto("/read/alice/1?mode=adventure");
  await expect(page).toHaveURL(/page=1/);
  for (let i = 0; i < 6; i++) {
    const choice = page.getByText("how do you want to play?", { exact: false });
    if (await choice.isVisible()) return;
    await page.getByRole("button", { name: /Next page/ }).click();
  }
  await expect(page.getByText("how do you want to play?", { exact: false })).toBeVisible();
}

test("book → adventure: style, choice, detour, rejoin, undo", async ({ page }) => {
  await page.goto("/book/alice");
  await page.getByTestId("mode-adventure").click();
  await expect(page).toHaveURL(/mode=adventure/);

  // Already on the reader: don't start a second navigation to the same URL.
  await readToFirstChoice(page, { navigate: false });
  // The page can't be turned until a choice is made.
  await expect(page.getByRole("button", { name: /Next (page|chapter)/ })).toBeDisabled();

  // The first choice introduces the interaction style, in-story.
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();

  const prompt = page.getByTestId("choice-prompt");
  await expect(prompt).toBeVisible();
  const options = prompt.getByRole("listitem");
  await expect(options).toHaveCount(3);
  const firstLabel = (await options.first().innerText()).replace("✦", "").trim();
  await options.first().getByRole("button").click();

  // The detour is marked as generated and streams in (mock provider in tests).
  const detour = page.getByTestId("detour");
  await expect(detour.getByText("Your adventure")).toBeVisible();
  await expect(detour.getByText(`You chose: ${firstLabel}`)).toBeVisible();
  await expect(detour.getByText("The original story continues")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Next (page|chapter)/ })).toBeEnabled();

  // Undo brings the choice back.
  await detour.getByRole("button", { name: /Go back one choice/ }).click();
  await expect(page.getByTestId("choice-prompt")).toBeVisible();
  await expect(page.getByTestId("detour")).toHaveCount(0);

  // Keeping the original removes the choice and unblocks the page.
  await page.getByRole("button", { name: /Keep reading the original/ }).click();
  await expect(page.getByTestId("choice-prompt")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Next (page|chapter)/ })).toBeEnabled();
});

test("be a character: pick a character and see their options", async ({ page }) => {
  await readToFirstChoice(page);
  await page.getByRole("radio", { name: /Be a character/ }).click();
  await page
    .getByRole("group", { name: "Who do you want to be?" })
    .getByRole("radio")
    .first()
    .click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page.getByTestId("choice-prompt")).toBeVisible();

  // Adventure settings can change the style later.
  await page.getByRole("button", { name: "Adventure settings" }).click();
  await expect(page.getByText(/Being a character as/)).toBeVisible();
});

test("adventure progress survives a reload", async ({ page }) => {
  await readToFirstChoice(page);
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByTestId("choice-prompt").getByRole("button").first().click();
  await expect(page.getByText("The original story continues")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByTestId("detour")).toBeVisible();
  await expect(page.getByText("The original story continues")).toBeVisible();
});

test("style picker works from the keyboard (one tab stop, arrow keys move)", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "WebKit doesn't Tab to form controls by default (a macOS setting)",
  );
  await readToFirstChoice(page);
  const direct = page.getByRole("radio", { name: /Direct the story/ });
  await direct.focus();
  await page.keyboard.press("Space");
  await expect(direct).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Be a character/ })).toBeChecked();
  await expect(page.getByRole("group", { name: "Who do you want to be?" })).toBeVisible();
});
