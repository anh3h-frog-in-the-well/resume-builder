import { signIn } from "./support/auth";
import { EditorPage } from "./support/editor";
import { expect, test } from "./support/fixtures";
import { sampleResume } from "./support/resume";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.describe("polish the professional summary", () => {
  test("replaces the summary with the polished text", async ({ page, polishApi, resumeApi }) => {
    await polishApi.succeed("summary", "A crisp, polished summary.", 1500);
    const editor = new EditorPage(page);
    await editor.goto();

    const summarySection = editor.sectionPanel("Basic information");
    const button = summarySection.getByRole("button", { name: "Polish with local AI" });
    await button.click();

    await expect(summarySection.getByRole("button", { name: "Polishing..." })).toBeDisabled();
    await expect(editor.field("About you")).toBeDisabled();

    await expect(summarySection.getByRole("status")).toHaveText(
      "Polished with local AI. Review before using.",
    );
    await expect(editor.field("About you")).toHaveValue("A crisp, polished summary.");
    await expect(editor.field("About you")).toBeEnabled();
    await expect(editor.preview).toContainText("A crisp, polished summary.");
    expect(polishApi.requests.summary).toEqual([{ summary: sampleResume().summary }]);

    await expect.poll(() => resumeApi.lastSaved()?.summary).toBe("A crisp, polished summary.");
  });

  test("shows the error returned by the server", async ({ page, polishApi }) => {
    await polishApi.fail(
      "summary",
      "Unable to reach Ollama. Check that the local AI server is running and try again.",
    );
    const editor = new EditorPage(page);
    await editor.goto();

    await editor
      .sectionPanel("Basic information")
      .getByRole("button", { name: "Polish with local AI" })
      .click();

    await expect(editor.sectionPanel("Basic information").getByRole("alert")).toHaveText(
      "Unable to reach Ollama. Check that the local AI server is running and try again.",
    );
    await expect(editor.field("About you")).toHaveValue(sampleResume().summary);
  });

  test("cannot polish an empty summary", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("About you").fill("   ");

    await expect(
      editor.sectionPanel("Basic information").getByRole("button", { name: "Polish with local AI" }),
    ).toBeDisabled();
  });
});

test.describe("polish a work experience description", () => {
  test("polishes only the selected position", async ({ page, polishApi, resumeApi }) => {
    await polishApi.succeed("experience", "Built the dashboard relied on by 40k users.", 1500);
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Work experience");

    const second = editor.experienceCard(1);
    await second.getByRole("button", { name: "Polish with local AI" }).click();

    // While polishing, the whole list is locked and feedback is scoped to the card.
    await expect(second.getByRole("button", { name: "Polishing..." })).toBeDisabled();
    await expect(second.getByRole("status")).toHaveText("Polishing position 2...");
    await expect(editor.field("What did you accomplish?", second)).toBeDisabled();
    await expect(editor.field("What did you accomplish?", editor.experienceCard(0))).toBeEnabled();
    await expect(page.getByRole("button", { name: "Add experience" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Remove position 1" })).toBeDisabled();

    await expect(second.getByRole("status")).toHaveText(
      "Position 2 polished. Review before using.",
    );
    await expect(editor.field("What did you accomplish?", second)).toHaveValue(
      "Built the dashboard relied on by 40k users.",
    );
    await expect(editor.field("What did you accomplish?", editor.experienceCard(0))).toHaveValue(
      sampleResume().experience[0].description,
    );
    await expect(page.getByRole("button", { name: "Add experience" })).toBeEnabled();
    await expect(editor.preview).toContainText("Built the dashboard relied on by 40k users.");
    expect(polishApi.requests.experience).toEqual([
      { description: sampleResume().experience[1].description },
    ]);

    await expect
      .poll(() => resumeApi.lastSaved()?.experience[1].description)
      .toBe("Built the dashboard relied on by 40k users.");
  });

  test("shows the error next to the position that failed", async ({ page, polishApi }) => {
    await polishApi.fail("experience", "The local AI service could not polish the text.", 503);
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.openSection("Work experience");

    const first = editor.experienceCard(0);
    await first.getByRole("button", { name: "Polish with local AI" }).click();

    await expect(first.getByRole("alert")).toHaveText(
      "The local AI service could not polish the text.",
    );
    await expect(editor.experienceCard(1).getByRole("alert")).toHaveCount(0);
    await expect(editor.field("What did you accomplish?", first)).toHaveValue(
      sampleResume().experience[0].description,
    );
  });
});
