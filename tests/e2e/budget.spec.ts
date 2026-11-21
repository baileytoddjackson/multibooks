import { expect, test } from "./fixtures";

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

test("a new adventure shows the resting message and stays saved", async ({ page }) => {
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
  await page.getByTestId("choice-prompt").getByRole("listitem").first().getByRole("button").click();

  await expect(page).toHaveURL(/\/story\//);
  await expect(page.getByText("The story machine is resting for today.")).toBeVisible();
  // No raw errors, and the adventure is saved so it can be picked up tomorrow.
  await expect(page.getByText(/error|failed|500/i)).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Alice in Wonderland: my adventure/ })).toBeVisible();
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
