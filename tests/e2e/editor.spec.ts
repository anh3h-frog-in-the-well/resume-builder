import { signIn } from "./support/auth";
import { EditorPage } from "./support/editor";
import { expect, fakeVersion, test } from "./support/fixtures";
import { sampleResume } from "./support/resume";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.describe("loading a draft", () => {
  test("restores the saved resume into the form and the preview", async ({ page, resumeApi }) => {
    resumeApi.reset({
      versions: [fakeVersion({}, { name: "Restored Person", template: "classic" })],
    });
    const editor = new EditorPage(page);

    await editor.goto();

    await expect(editor.saveStatus).toHaveText(/Restored from server|Saved/);
    await expect(editor.field("Full name")).toHaveValue("Restored Person");
    await expect(editor.preview.getByRole("heading", { name: "Restored Person" })).toBeVisible();
    await expect(editor.preview).toHaveClass(/template-classic/);
    await expect(editor.preview).toContainText("Northwind Labs");
    await expect(editor.preview).toContainText("Apr 2021 — Present");
    await expect(editor.preview).toContainText("Jan 2018 — Mar 2021");
    await expect(editor.preview.locator(".resume-skills span")).toHaveText([
      "TypeScript",
      "React",
      "Accessibility",
      "Testing",
    ]);
  });

  test("opens the sample resume created for a new account", async ({ page, resumeApi }) => {
    // The server creates the sample resume for a brand-new account and flags it.
    resumeApi.reset({
      versions: [fakeVersion({}, sampleResume({ name: "Max Mustermann" }))],
      isNew: true,
    });
    const editor = new EditorPage(page);

    await editor.goto();

    await expect(editor.saveStatus).toHaveText("New draft");
    await expect(editor.field("Full name")).toHaveValue("Max Mustermann");
    await expect(editor.preview).toContainText("Max Mustermann");
    // Nothing is written back until the user edits something.
    await page.waitForTimeout(800);
    expect(resumeApi.saved).toHaveLength(0);
  });

  test("reports when the server cannot be reached", async ({ page, resumeApi }) => {
    resumeApi.reset({ listStatus: 503 });
    const editor = new EditorPage(page);

    await editor.goto();

    await expect(editor.saveStatus).toHaveText("Server load failed");
    // Nothing is autosaved on top of a failed load.
    await page.waitForTimeout(800);
    expect(resumeApi.saved).toHaveLength(0);
  });
});

test.describe("editing and autosave", () => {
  test("autosaves edits and keeps a browser backup", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("Full name").fill("Jordan Rivers");
    await expect(editor.saveStatus).toHaveText("Unsaved changes");
    await expect(editor.preview.getByRole("heading", { name: "Jordan Rivers" })).toBeVisible();

    await expect.poll(() => resumeApi.lastSaved()?.name).toBe("Jordan Rivers");
    await editor.expectSaved();
    const backup = await page.evaluate(() => window.localStorage.getItem("draftly-resume"));
    expect(JSON.parse(backup ?? "{}").name).toBe("Jordan Rivers");
  });

  test("shows a save failure when the server rejects the draft", async ({ page, resumeApi }) => {
    resumeApi.reset({ putStatus: 503 });
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("Full name").fill("Jordan Rivers");

    await expect(editor.saveStatus).toHaveText("Server save failed");
  });

  test("updates contact details and the summary in the preview", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("Professional title").fill("Staff Engineer");
    await editor.field("Email address").fill("jordan@example.com");
    await editor.field("Phone number").fill("+1 555 123 4567");
    await editor.field("Location").fill("Lisbon");
    await editor.field("Website or portfolio").fill("jordan.dev");
    await editor.field("About you").fill("I ship accessible software.");

    await expect(editor.preview.locator(".resume-role")).toHaveText("Staff Engineer");
    await expect(editor.preview.locator(".resume-contact span")).toHaveText([
      "jordan@example.com",
      "+1 555 123 4567",
      "Lisbon",
      "jordan.dev",
    ]);
    await expect(editor.preview).toContainText("I ship accessible software.");
    await expect(page.getByText("27 characters · Aim for 2–4 sentences")).toBeVisible();
  });
});

test.describe("navigating sections", () => {
  test("walks through the steps with Continue and Back", async ({ page, printSpy }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await expect(editor.heading).toHaveText(/^Personal details/);
    await expect(editor.stepCount).toHaveText("1 / 4");
    // There is no previous step, so the Back button is disabled and hidden.
    await expect(page.locator(".back-button")).toBeDisabled();
    await expect(page.locator(".back-button")).toBeHidden();
    await expect(editor.field("Full name")).toBeVisible();
    await expect(editor.field("Your skills")).toBeHidden();

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(editor.heading).toHaveText(/^Skills/);
    await expect(editor.stepCount).toHaveText("2 / 4");
    await expect(editor.field("Your skills")).toBeVisible();
    await expect(editor.field("Full name")).toBeHidden();
    await expect(page.getByRole("button", { name: /Back/ })).toBeVisible();

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(editor.heading).toHaveText(/^Work experience/);
    await expect(editor.stepCount).toHaveText("3 / 4");

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(editor.heading).toHaveText(/^Education/);
    await expect(editor.stepCount).toHaveText("4 / 4");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeHidden();

    await page.getByRole("button", { name: /Finish resume/ }).click();
    expect(await printSpy.calls()).toBe(1);

    await page.getByRole("button", { name: /Back/ }).click();
    await expect(editor.heading).toHaveText(/^Work experience/);
  });

  test("jumps directly to a section from the sidebar", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.openSection("Education");
    await expect(editor.sidebarLink("Education")).toHaveClass(/active/);
    await expect(editor.sidebarLink("Personal details")).not.toHaveClass(/active/);
    await expect(editor.field("School or institution")).toBeVisible();

    await editor.openSection("Personal details");
    await expect(editor.field("Full name")).toBeVisible();
  });
});

test.describe("skills", () => {
  test("renders comma-separated skills as chips", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Skills");

    await editor.field("Your skills").fill("Go, , Rust ,Kubernetes");

    await expect(editor.preview.locator(".resume-skills span")).toHaveText([
      "Go",
      "Rust",
      "Kubernetes",
    ]);
    await expect.poll(() => resumeApi.lastSaved()?.skills).toBe("Go, , Rust ,Kubernetes");
  });

  test("hides the skills section of the preview when empty", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Skills");

    await editor.field("Your skills").fill("");

    await expect(editor.preview.getByRole("heading", { name: "Skills" })).toBeHidden();
  });
});

test.describe("work experience", () => {
  test("adds, edits and removes positions", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Work experience");
    await expect(editor.experienceCards).toHaveCount(2);

    await page.getByRole("button", { name: "Add experience" }).click();
    await expect(editor.experienceCards).toHaveCount(3);
    const card = editor.experienceCard(2);
    await expect(card).toContainText("Position 3");

    await editor.field("Job title", card).fill("Engineering Manager");
    await editor.field("Company", card).fill("Fabrikam");
    await editor.field("From", card).fill("2023-09");
    await editor.field("What did you accomplish?", card).fill("Grew the team from 3 to 9.");

    await expect(card).toContainText("Engineering Manager");
    const previewEntry = editor.preview.locator(".resume-entry").filter({ hasText: "Fabrikam" });
    await expect(previewEntry).toContainText("Engineering Manager");
    await expect(previewEntry).toContainText("Sep 2023 — Present");
    await expect(previewEntry).toContainText("Grew the team from 3 to 9.");

    await editor.field("To", card).fill("2024-12");
    await expect(previewEntry).toContainText("Sep 2023 — Dec 2024");

    await expect.poll(() => resumeApi.lastSaved()?.experience[2]).toEqual({
      company: "Fabrikam",
      role: "Engineering Manager",
      from: "2023-09",
      to: "2024-12",
      description: "Grew the team from 3 to 9.",
    });

    await page.getByRole("button", { name: "Remove position 1" }).click();
    await expect(editor.experienceCards).toHaveCount(2);
    await expect(editor.preview).not.toContainText("Northwind Labs");
    await expect
      .poll(() => resumeApi.lastSaved()?.experience.map((item) => item.company))
      .toEqual([
      "Contoso",
      "Fabrikam",
    ]);
  });

  test("hides the experience preview section when all positions are removed", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Work experience");

    await page.getByRole("button", { name: "Remove position 2" }).click();
    await page.getByRole("button", { name: "Remove position 1" }).click();

    await expect(editor.experienceCards).toHaveCount(0);
    await expect(editor.preview.getByRole("heading", { name: "Experience" })).toBeHidden();
  });
});

test.describe("education", () => {
  test("adds, edits and removes entries", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Education");
    await expect(editor.educationCards).toHaveCount(1);

    await page.getByRole("button", { name: "Add education" }).click();
    const card = editor.educationCard(1);
    await expect(card).toContainText("Education 2");

    await editor.field("School or institution", card).fill("Open University");
    await editor.field("Degree or qualification", card).fill("MSc Data Science");
    await editor.field("Dates", card).fill("2020 — 2022");

    await expect(card).toContainText("Open University");
    const previewEntry = editor.preview.locator(".resume-entry").filter({ hasText: "Open University" });
    await expect(previewEntry).toContainText("MSc Data Science");
    await expect(previewEntry).toContainText("2020 — 2022");

    await expect.poll(() => resumeApi.lastSaved()?.education.length).toBe(2);

    await page.getByRole("button", { name: "Remove education 1" }).click();
    await expect(editor.educationCards).toHaveCount(1);
    await expect(editor.preview).not.toContainText("Hamburg University of Technology");
  });
});

test.describe("templates", () => {
  test("switches the preview template and persists the choice", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await expect(editor.templateCard("Modern")).toHaveAttribute("aria-pressed", "true");
    await expect(editor.preview).toHaveClass(/template-modern/);

    await editor.templateCard("Creative").click();
    await expect(editor.templateCard("Creative")).toHaveAttribute("aria-pressed", "true");
    await expect(editor.templateCard("Modern")).toHaveAttribute("aria-pressed", "false");
    await expect(editor.preview).toHaveClass(/template-creative/);

    await expect.poll(() => resumeApi.lastSaved()?.template).toBe("creative");

    await editor.templateCard("Classic").click();
    await expect(editor.preview).toHaveClass(/template-classic/);
  });
});
