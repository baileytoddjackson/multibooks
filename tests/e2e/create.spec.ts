import { expect, test } from "@playwright/test";

test("stepper → story: genre, Surprise Me, skip details, play, undo, My Stories", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("create-card").click();
  await expect(page).toHaveURL(/\/create$/);

  // Step 1: genre
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  const next = page.getByRole("button", { name: /Next/ });
  await expect(next).toBeDisabled();
  await page.getByRole("radio", { name: /Mystery/ }).click();
  await next.click();

  // Step 2: setting via the free Surprise Me list, then reroll
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: /Surprise me/ }).click();
  const setting = page.getByLabel("Setting");
  const first = await setting.inputValue();
  expect(first.length).toBeGreaterThan(10);
  await page.getByRole("button", { name: /Surprise me again/ }).click();
  await expect(setting).not.toHaveValue(first);
  await page.getByRole("button", { name: /Next/ }).click();

  // Step 3: details are optional
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  // The opening is written, then we land on the story page.
  await expect(page).toHaveURL(/\/story\//, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Glass Lighthouse");

  // Style selection appears organically after the opening.
  await page.getByRole("radio", { name: /Be a character/ }).click();
  await page.getByRole("radio", { name: /Mia Torres/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();

  const choices = page.getByTestId("cyo-choices");
  await expect(choices).toBeVisible();
  await choices.getByRole("button", { name: /Follow the sound of the bell/ }).click();
  await expect(page.getByText("You chose: Follow the sound of the bell")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Part 2")).toBeVisible();

  // Undo returns to the opening's choices.
  await page.getByRole("button", { name: /Go back one choice/ }).click();
  await expect(page.getByText("You chose:")).toHaveCount(0);
  await expect(page.getByTestId("cyo-choices")).toBeVisible();

  // Rename the story.
  await page.getByRole("button", { name: "Edit title" }).click();
  await page.getByLabel("Story title").fill("Mia and the Bell");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mia and the Bell");

  // It shows up in My Stories.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My Stories" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mia and the Bell/ })).toBeVisible();
});

test("ideas with personal info are gently redirected, with suggestions", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("radio", { name: /Fantasy/ }).click();
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByLabel("Setting").fill("my name is Jordan and I live in Springfield");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Start my story/ }).click();

  await expect(page.getByText(/keep real names, schools and addresses out/)).toBeVisible();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  // Tapping a suggestion fills the setting.
  const suggestion = page.getByRole("status").getByRole("button").first();
  const text = (await suggestion.innerText()).trim();
  await suggestion.click();
  await expect(page.getByLabel("Setting")).toHaveValue(text);
});

test("setting input is length-limited", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("radio", { name: /Humor/ }).click();
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByLabel("Setting").fill("x".repeat(200));
  await expect(page.getByText("120/120")).toBeVisible();
});
