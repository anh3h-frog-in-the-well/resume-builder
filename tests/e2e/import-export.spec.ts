import { signIn } from "./support/auth";
import { EditorPage } from "./support/editor";
import { expect, test } from "./support/fixtures";
import { sampleResume } from "./support/resume";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

function jsonFile(name: string, contents: unknown, mimeType = "application/json") {
  return {
    name,
    mimeType,
    buffer: Buffer.from(typeof contents === "string" ? contents : JSON.stringify(contents)),
  };
}

test.describe("import JSON", () => {
  test("replaces the draft with an exported file and saves it", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    const imported = sampleResume({
      name: "Imported Person",
      role: "Data Engineer",
      template: "creative",
      skills: "SQL, Spark",
    });
    await editor.importInput.setInputFiles(
      jsonFile("draft.json", { format: "draftly-resume", version: 1, resume: imported }),
    );

    await expect(editor.importMessage).toHaveText(
      /Resume imported\. Review the details; your changes are being saved\./,
    );
    await expect(editor.importMessage).toHaveAttribute("role", "status");
    await expect(editor.field("Full name")).toHaveValue("Imported Person");
    await expect(editor.preview.getByRole("heading", { name: "Imported Person" })).toBeVisible();
    await expect(editor.preview).toHaveClass(/template-creative/);
    await expect(editor.preview.locator(".resume-skills span")).toHaveText(["SQL", "Spark"]);

    await expect.poll(() => resumeApi.lastSaved()).toMatchObject({
      name: "Imported Person",
      role: "Data Engineer",
      template: "creative",
    });
    await editor.expectSaved();

    await editor.importMessage.getByRole("button", { name: "Dismiss message" }).click();
    await expect(editor.importMessage).toBeHidden();
  });

  test("accepts a bare resume object", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.importInput.setInputFiles(
      jsonFile("bare.json", sampleResume({ name: "Bare Import" })),
    );

    await expect(editor.field("Full name")).toHaveValue("Bare Import");
  });

  test("rejects files that are not JSON", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.importInput.setInputFiles(jsonFile("notes.txt", "hello", "text/plain"));

    await expect(editor.importMessage).toHaveText(/Choose a JSON file\./);
    await expect(editor.importMessage).toHaveAttribute("role", "alert");
    await expect(editor.importMessage).toHaveClass(/has-error/);
    await expect(editor.field("Full name")).toHaveValue("Erin Example");
  });

  test("rejects JSON that is not a resume", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.importInput.setInputFiles(jsonFile("bad.json", { hello: "world" }));

    await expect(editor.importMessage).toHaveText(
      /This JSON file does not contain valid resume data\./,
    );
  });

  test("rejects an unsupported export version", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.importInput.setInputFiles(
      jsonFile("old.json", { format: "draftly-resume", version: 2, resume: sampleResume() }),
    );

    await expect(editor.importMessage).toHaveText(
      /This Draftly JSON file has an unsupported format\./,
    );
  });

  test("rejects malformed JSON", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.importInput.setInputFiles(jsonFile("broken.json", "{ not json"));

    await expect(editor.importMessage).toHaveClass(/has-error/);
    await expect(editor.importMessage).toContainText(/JSON/);
  });
});

test.describe("export", () => {
  test("downloads the resume as a JSON file that can be re-imported", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.field("Full name").fill("Export Person");

    await editor.openExportMenu();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /JSON file/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("Export Person-resume.json");
    const contents = JSON.parse(
      (await streamToBuffer(await download.createReadStream())).toString("utf8"),
    );
    expect(contents).toMatchObject({
      format: "draftly-resume",
      version: 1,
      resume: { name: "Export Person", email: "erin@example.com" },
    });
    await expect(page.locator(".export-menu")).toBeHidden();
  });

  test("downloads a Word document", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.openExportMenu();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Word document/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("Erin Example-resume.doc");
    const html = (await streamToBuffer(await download.createReadStream())).toString("utf8");
    expect(html).toContain("<h1>Erin Example</h1>");
    expect(html).toContain("Northwind Labs");
    expect(html).toContain('<main class="resume modern">');
  });

  test("opens the print dialog for the PDF export", async ({ page, printSpy }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.openExportMenu();
    await page.getByRole("button", { name: /Save as PDF/ }).click();

    expect(await printSpy.calls()).toBe(1);
    await expect(page.locator(".export-menu")).toBeHidden();
  });

  test("toggles the export menu closed again", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.openExportMenu();
    await page.getByRole("button", { name: /^Export/ }).click();

    await expect(page.locator(".export-menu")).toBeHidden();
  });
});

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
