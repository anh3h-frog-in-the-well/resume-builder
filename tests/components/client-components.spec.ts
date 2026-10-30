import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openStory(page: Page, story: string) {
  await page.goto(`/component-gallery?story=${encodeURIComponent(story)}`);
  return page.locator("#root");
}

test.describe("ResumeField", () => {
  test("updates a labeled text input", async ({ page }) => {
    const component = await openStory(page, "client/ResumeField/TextInput");

    await component.getByLabel("Full name").fill("Jordan Lee");

    await expect(component.getByTestId("field-value")).toHaveText("Jordan Lee");
  });

  test("renders and updates a textarea with its hint", async ({ page }) => {
    const component = await openStory(page, "client/ResumeField/Textarea");

    await expect(component.getByText("Keep it concise.")).toBeVisible();
    await component.getByLabel("About you").fill("A short profile.");

    await expect(component.getByTestId("field-value")).toHaveText(
      "A short profile.",
    );
  });
});

test.describe("ExperienceSection", () => {
  test("updates the selected experience without changing other entries", async ({
    page,
  }) => {
    const component = await openStory(
      page,
      "client/ExperienceSection/Interactive",
    );

    await component.getByLabel("Company").nth(0).fill("Updated Company");

    await expect(component.getByTestId("experience-value")).toHaveValue(
      /"company":"Updated Company".*"company":"Acme"/,
    );
  });

  test("adds an empty experience", async ({ page }) => {
    const component = await openStory(
      page,
      "client/ExperienceSection/Interactive",
    );

    await component.getByRole("button", { name: "Add experience" }).click();

    await expect(component.getByTestId("experience-value")).toHaveValue(
      /"company":"","role":"","from":"","to":"","description":""/,
    );
    await expect(component.getByLabel("Company")).toHaveCount(3);
  });

  test("removes the selected experience", async ({ page }) => {
    const component = await openStory(
      page,
      "client/ExperienceSection/Interactive",
    );

    await component.getByRole("button", { name: "Remove position 1" }).click();

    await expect(component.getByLabel("Company")).toHaveCount(1);
    await expect(component.getByTestId("experience-value")).toHaveValue(
      /"company":"Acme"/,
    );
  });

  test("polishes an experience and shows its updated description", async ({
    page,
  }) => {
    await page.route("**/api/polish-experience", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          description: "Led product design and improved user outcomes.",
        }),
      }),
    );
    const component = await openStory(
      page,
      "client/ExperienceSection/Interactive",
    );
    const firstExperience = component.locator(".repeat-card").first();

    await firstExperience
      .getByRole("button", { name: "Polish with local AI" })
      .click();

    await expect(
      firstExperience.getByLabel("What did you accomplish?"),
    ).toHaveValue("Led product design and improved user outcomes.");
    await expect(firstExperience.getByRole("status")).toContainText(
      "Position 1 polished.",
    );
  });

  test("shows an error when experience polishing fails", async ({ page }) => {
    await page.route("**/api/polish-experience", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "The service is unavailable." }),
      }),
    );
    const component = await openStory(
      page,
      "client/ExperienceSection/Interactive",
    );

    await component
      .locator(".repeat-card")
      .first()
      .getByRole("button", { name: "Polish with local AI" })
      .click();

    await expect(component.getByRole("alert")).toHaveText(
      "The service is unavailable.",
    );
  });

  test("disables polishing when the description is empty", async ({ page }) => {
    const component = await openStory(page, "client/ExperienceSection/Empty");

    await component.getByRole("button", { name: "Add experience" }).click();

    await expect(
      component.getByRole("button", { name: "Polish with local AI" }),
    ).toBeDisabled();
  });
});

test.describe("PersonalInfoSection", () => {
  test("updates a personal detail", async ({ page }) => {
    const component = await openStory(
      page,
      "client/PersonalInfoSection/Interactive",
    );

    await component.getByLabel("Full name").fill("Jordan Lee");

    await expect(component.getByLabel("Full name")).toHaveValue("Jordan Lee");
  });

  test("polishes a summary and shows the success status", async ({
    page,
  }) => {
    await page.route("**/api/polish-summary", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ summary: "Clear and concise profile." }),
      }),
    );
    const component = await openStory(
      page,
      "client/PersonalInfoSection/Interactive",
    );

    await component.getByRole("button", { name: "Polish with local AI" }).click();

    await expect(component.getByLabel("About you")).toHaveValue(
      "Clear and concise profile.",
    );
    await expect(component.getByRole("status")).toContainText(
      "Polished with local AI.",
    );
  });

  test("shows the service error when polishing fails", async ({
    page,
  }) => {
    await page.route("**/api/polish-summary", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "The service is unavailable." }),
      }),
    );
    const component = await openStory(
      page,
      "client/PersonalInfoSection/Interactive",
    );

    await component.getByRole("button", { name: "Polish with local AI" }).click();

    await expect(component.getByRole("alert")).toHaveText(
      "The service is unavailable.",
    );
  });

  test("rejects unsupported photo types", async ({ page }) => {
    const component = await openStory(
      page,
      "client/PersonalInfoSection/Interactive",
    );

    await component.locator("#resume-photo").setInputFiles({
      name: "portrait.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("not an image"),
    });

    await expect(component.getByRole("alert")).toHaveText(
      "Choose a JPG, PNG, or WebP image.",
    );
  });
});

test.describe("ResumeHeader", () => {
  test("imports a selected JSON file", async ({ page }) => {
    const component = await openStory(page, "client/ResumeHeader/Interactive");

    await component.locator("#resume-json-import").setInputFiles({
      name: "resume.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });

    await expect(component.getByTestId("imported-file")).toHaveText(
      "resume.json",
    );
  });

  test("exports JSON and closes the export menu", async ({ page }) => {
    const component = await openStory(page, "client/ResumeHeader/Interactive");
    const downloadPromise = page.waitForEvent("download");

    await component.getByRole("button", { name: "Export" }).click();
    await component.getByRole("button", { name: /JSON file/ }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Alex Morgan-resume.json");
    await expect(
      component.getByRole("button", { name: /JSON file/ }),
    ).toHaveCount(0);
  });
});
