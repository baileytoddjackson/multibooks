import { expect, test } from "@playwright/test";

/**
 * Runs against a server with DAILY_BUDGET_USD=0: live generation is off, but the app must
 * degrade gracefully. Original books still read normally; new generations show a friendly message.
 */

test("canon reading still works when the budget is used up", async ({ page }) => {
  await page.goto("/read/moby-dick/1?mode=canon");
  await expect(page.getByText("Call me Ishmael.")).toBeVisible();
  await page.getByRole("button", { name: /Next page/ }).click();
  await expect(page.getByText(/^Page 2 of/)).toBeVisible();
});

test("a new adventure detour shows the resting message and offers the original", async ({
  page,
}) => {
  await page.goto("/read/alice/1?mode=adventure");
  await expect(page).toHaveURL(/page=1/);
  for (
    let i = 0;
    i < 6 && !(await page.getByText("how do you want to play?", { exact: false }).isVisible());
    i++
  ) {
    await page.getByRole("button", { name: /Next page/ }).click();
  }
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByTestId("choice-prompt").getByRole("button").first().click();

  const detour = page.getByTestId("detour");
  await expect(detour.getByText("The story machine is resting for today.")).toBeVisible();
  // No raw errors, and the reader can't get stuck: returning to the original unblocks the page.
  await expect(page.getByText(/error|failed|500/i)).toHaveCount(0);
  await page
    .getByRole("button", { name: /Return to the original story|Read the original instead/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /Next (page|chapter)/ })).toBeEnabled();
});

test("Create Your Own shows a friendly resting screen, not an error", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("radio", { name: /Sci-Fi/ }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: /Surprise me/ }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("The story machine is resting.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the library" })).toBeVisible();
});
