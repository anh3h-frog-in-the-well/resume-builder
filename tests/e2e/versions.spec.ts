import { signIn } from "./support/auth";
import { EditorPage } from "./support/editor";
import { expect, fakeVersion, test } from "./support/fixtures";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

const switcher = (editor: EditorPage) =>
  editor.page.getByRole("button", { name: "Switch resume" });
const menu = (editor: EditorPage) => editor.page.getByRole("menu", { name: "Your resumes" });

async function openMenu(editor: EditorPage) {
  await switcher(editor).click();
  await expect(menu(editor)).toBeVisible();
}

test.describe("switching between resumes", () => {
  test("lists every resume and opens the selected one", async ({ page, resumeApi }) => {
    resumeApi.reset({
      versions: [
        fakeVersion({ title: "General" }, { name: "Erin General" }),
        fakeVersion({ title: "Frontend focus" }, { name: "Erin Frontend", template: "classic" }),
      ],
    });
    const editor = new EditorPage(page);
    await editor.goto();

    await expect(switcher(editor)).toContainText("General");
    await expect(switcher(editor)).toContainText("2 / 10");
    await expect(editor.field("Full name")).toHaveValue("Erin General");

    await openMenu(editor);
    const items = menu(editor).getByRole("menuitemradio");
    await expect(items).toHaveText(["General", "Frontend focus"]);
    await expect(items.nth(0)).toHaveAttribute("aria-checked", "true");

    await items.nth(1).click();

    await expect(menu(editor)).toBeHidden();
    await expect(switcher(editor)).toContainText("Frontend focus");
    await expect(editor.saveStatus).toHaveText("Restored from server");
    await expect(editor.field("Full name")).toHaveValue("Erin Frontend");
    await expect(editor.preview.getByRole("heading", { name: "Erin Frontend" })).toBeVisible();
    await expect(editor.preview).toHaveClass(/template-classic/);

    // The choice is remembered for the next visit.
    await page.reload();
    await expect(switcher(editor)).toContainText("Frontend focus");
    await expect(editor.field("Full name")).toHaveValue("Erin Frontend");
  });

  test("saves pending edits before opening another resume", async ({ page, resumeApi }) => {
    resumeApi.reset({
      versions: [fakeVersion({ title: "First" }), fakeVersion({ title: "Second" })],
    });
    const [first] = resumeApi.versions();
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("Full name").fill("Edited before switching");
    await openMenu(editor);
    await menu(editor).getByRole("menuitemradio", { name: "Second" }).click();

    await expect(switcher(editor)).toContainText("Second");
    expect(resumeApi.saved.find((entry) => entry.id === first.id)?.resume.name).toBe(
      "Edited before switching",
    );

    await openMenu(editor);
    await menu(editor).getByRole("menuitemradio", { name: "First" }).click();
    await expect(editor.field("Full name")).toHaveValue("Edited before switching");
  });

  test("reports when a resume cannot be opened", async ({ page, resumeApi }) => {
    resumeApi.reset({
      versions: [fakeVersion({ title: "First" }), fakeVersion({ title: "Second" })],
    });
    const editor = new EditorPage(page);
    await editor.goto();

    resumeApi.reset({ getStatus: 503 });
    await openMenu(editor);
    await menu(editor).getByRole("menuitemradio", { name: "Second" }).click();

    await expect(editor.importMessage).toHaveAttribute("role", "alert");
    await expect(editor.importMessage).toContainText("Unable to load the resume in the database.");
    await expect(editor.saveStatus).toHaveText("Server load failed");
  });
});

test.describe("creating resumes", () => {
  test("creates a blank resume and opens it", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Skills");

    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "New blank resume" }).click();

    await expect(switcher(editor)).toContainText("Resume 2");
    await expect(switcher(editor)).toContainText("2 / 10");
    await expect(editor.importMessage).toHaveText(/"Resume 2" is ready to edit\./);
    // A new resume starts on the first step with empty fields.
    await expect(editor.heading).toHaveText(/^Personal details/);
    await expect(editor.field("Full name")).toHaveValue("");
    await expect(editor.preview).toContainText("Your Name");
    expect(resumeApi.versions().map((version) => version.title)).toEqual([
      "My resume",
      "Resume 2",
    ]);
    expect(resumeApi.versions()[1].resume.name).toBe("");

    await editor.field("Full name").fill("Second Persona");
    await expect
      .poll(() => resumeApi.versions()[1].resume.name)
      .toBe("Second Persona");
    // The first resume is untouched.
    expect(resumeApi.versions()[0].resume.name).toBe("Erin Example");
  });

  test("duplicates the open resume including unsaved edits", async ({ page, resumeApi }) => {
    resumeApi.reset({ versions: [fakeVersion({ title: "Product design" })] });
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("Professional title").fill("Design Lead");
    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "Duplicate this resume" }).click();

    await expect(switcher(editor)).toContainText("Product design (copy)");
    await expect(editor.field("Full name")).toHaveValue("Erin Example");
    await expect(editor.field("Professional title")).toHaveValue("Design Lead");
    const versions = resumeApi.versions();
    expect(versions).toHaveLength(2);
    expect(versions[1].title).toBe("Product design (copy)");
    expect(versions[1].resume.role).toBe("Design Lead");
    expect(versions[0].resume.role).toBe("Design Lead");
  });

  test("blocks new resumes at the limit", async ({ page, resumeApi }) => {
    resumeApi.reset({
      versions: Array.from({ length: 10 }, (_, index) =>
        fakeVersion({ title: `Resume ${index + 1}` }),
      ),
    });
    const editor = new EditorPage(page);
    await editor.goto();

    await expect(switcher(editor)).toContainText("10 / 10");
    await openMenu(editor);
    await expect(menu(editor).getByRole("menuitem", { name: "New blank resume" })).toBeDisabled();
    await expect(
      menu(editor).getByRole("menuitem", { name: "Duplicate this resume" }),
    ).toBeDisabled();
    await expect(menu(editor).getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  });

  test("shows the server error when creating fails", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    resumeApi.reset({ createStatus: 503 });
    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "New blank resume" }).click();

    await expect(editor.importMessage).toHaveAttribute("role", "alert");
    await expect(editor.importMessage).toContainText(
      "Unable to create the resume in the database.",
    );
    await expect(switcher(editor)).toContainText("My resume");
    await expect(switcher(editor)).toContainText("1 / 10");
  });
});

test.describe("renaming resumes", () => {
  test("renames the open resume", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "Rename" }).click();
    const input = menu(editor).getByLabel("Resume title");
    await expect(input).toHaveValue("My resume");
    await input.fill("  Backend   roles  ");
    await menu(editor).getByRole("button", { name: "Save title" }).click();

    await expect(menu(editor)).toBeHidden();
    await expect(switcher(editor)).toContainText("Backend roles");
    expect(resumeApi.versions()[0].title).toBe("Backend roles");

    await openMenu(editor);
    await expect(menu(editor).getByRole("menuitemradio")).toHaveText(["Backend roles"]);
  });

  test("rejects an empty title without calling the server", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "Rename" }).click();
    await menu(editor).getByLabel("Resume title").fill("   ");
    await menu(editor).getByRole("button", { name: "Save title" }).click();

    await expect(menu(editor).getByRole("alert")).toHaveText(
      "Enter a title of up to 80 characters.",
    );
    expect(resumeApi.versions()[0].title).toBe("My resume");

    await menu(editor).getByRole("button", { name: "Cancel" }).click();
    await expect(menu(editor)).toBeHidden();
    await expect(switcher(editor)).toContainText("My resume");
  });
});

test.describe("deleting resumes", () => {
  test("asks for confirmation and opens the next resume", async ({ page, resumeApi }) => {
    resumeApi.reset({
      versions: [
        fakeVersion({ title: "Keep me" }, { name: "Kept Person" }),
        fakeVersion({ title: "Old version" }, { name: "Old Person" }),
      ],
    });
    const editor = new EditorPage(page);
    await editor.goto();
    await openMenu(editor);
    await menu(editor).getByRole("menuitemradio", { name: "Old version" }).click();
    await expect(editor.field("Full name")).toHaveValue("Old Person");

    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "Delete" }).click();
    await expect(menu(editor)).toContainText("Delete Old version? This cannot be undone.");

    await menu(editor).getByRole("button", { name: "Cancel" }).click();
    await expect(menu(editor)).toBeHidden();
    expect(resumeApi.versions()).toHaveLength(2);

    await openMenu(editor);
    await menu(editor).getByRole("menuitem", { name: "Delete" }).click();
    await menu(editor).getByRole("button", { name: "Delete resume" }).click();

    await expect(switcher(editor)).toContainText("Keep me");
    await expect(switcher(editor)).toContainText("1 / 10");
    await expect(editor.field("Full name")).toHaveValue("Kept Person");
    await expect(editor.importMessage).toHaveText(/"Old version" was deleted\./);
    expect(resumeApi.versions().map((version) => version.title)).toEqual(["Keep me"]);
  });

  test("cannot delete the only resume", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await openMenu(editor);
    await expect(menu(editor).getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });
});
