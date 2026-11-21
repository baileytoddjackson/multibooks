import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures";

/** Scans a page against WCAG 2.1 A/AA and fails on any violation, listing what and where. */
async function expectAccessible(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next.js's dev-tools overlay is not part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join("\n    ")}`,
  );
  expect(summary, `${name} accessibility violations`).toEqual([]);
}

async function toFirstChoice(page: Page) {
  await page.goto("/read/alice/1?mode=adventure");
  await expect(page).toHaveURL(/page=1/);
  for (
    let i = 0;
    i < 6 && !(await page.getByText("how do you want to play?", { exact: false }).isVisible());
    i++
  ) {
    await page.getByRole("button", { name: /Next page/ }).click();
  }
}

test("dashboard", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page, "dashboard");
});

test("book page", async ({ page }) => {
  await page.goto("/book/odyssey");
  await expectAccessible(page, "book page");
});

test("canon reader in every theme", async ({ page }) => {
  await page.goto("/read/moby-dick/1?mode=canon");
  await expect(page.getByText("Call me Ishmael.")).toBeVisible();
  for (const theme of ["Light", "Sepia", "Dark"]) {
    await page.getByRole("button", { name: "Text settings" }).click();
    await page.getByRole("button", { name: theme }).click();
    await page.keyboard.press("Escape");
    // The reader fades between themes (150ms); scan once the colours have settled.
    await page.waitForTimeout(400);
    await expectAccessible(page, `reader (${theme})`);
  }
});

test("adventure: style picker, entry choice and adventure page", async ({ page }) => {
  await toFirstChoice(page);
  await expectAccessible(page, "style picker");
  await page.getByRole("radio", { name: /Direct the story/ }).click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await expectAccessible(page, "choice prompt");
  await page.getByTestId("choice-prompt").getByRole("listitem").first().getByRole("button").click();
  await expect(page.getByTestId("cyo-choices")).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page, "adventure page");
});

test("Create Your Own stepper and story", async ({ page }) => {
  await page.goto("/create");
  await expectAccessible(page, "stepper step 1");
  await page.getByRole("radio", { name: /Adventure/ }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: /Surprise me/ }).click();
  await expectAccessible(page, "stepper step 2");
  await page.getByRole("button", { name: "Next →" }).click();
  await expectAccessible(page, "stepper step 3");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/story\//, { timeout: 15_000 });
  await expectAccessible(page, "story page");
});

test("library (empty and with stories)", async ({ page, context, baseURL }) => {
  await page.goto("/library");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await expectAccessible(page, "empty library");
  const now = Date.now();
  await context.request.put(`${baseURL}/api/me/books/odyssey`, {
    data: { bookId: "odyssey", position: "c001p001", fraction: 0.1, wordsRead: 1, updatedAt: now },
  });
  await page.reload();
  await expect(page.getByTestId("library-entry")).toHaveCount(1);
  await expectAccessible(page, "library");
  await page.getByRole("button", { name: /^Remove / }).click();
  await expectAccessible(page, "library delete confirmation");
});

test("sign-in and sign-up", async ({ page }) => {
  await page.goto("/login");
  await expectAccessible(page, "sign-in");
  await page.goto("/signup?code=E2E-CODE");
  await expectAccessible(page, "sign-up");
  await page.getByRole("button", { name: "Create account" }).click();
  await expectAccessible(page, "sign-up with an error");
});

test("admin sign-in", async ({ page }) => {
  await page.goto("/admin/stats");
  await expectAccessible(page, "admin sign-in");
});
