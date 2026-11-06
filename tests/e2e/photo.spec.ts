import { signIn } from "./support/auth";
import { EditorPage } from "./support/editor";
import { expect, test } from "./support/fixtures";
import { onePixelPng } from "./support/resume";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.describe("profile photo", () => {
  test("uploads, previews, saves and removes a photo", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await expect(page.getByText("Upload photo")).toBeVisible();
    await expect(editor.preview.locator("img.resume-photo")).toHaveCount(0);

    await page.locator("#resume-photo").setInputFiles({
      name: "headshot.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });

    // The browser resizes the image and stores it as a JPEG data URL.
    const uploaded = page.getByAltText("Resume profile");
    await expect(uploaded).toBeVisible();
    await expect(uploaded).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await expect(editor.preview.locator("img.resume-photo")).toHaveAttribute(
      "src",
      /^data:image\/jpeg;base64,/,
    );
    await expect(page.getByText("Change photo")).toBeVisible();

    await expect.poll(() => resumeApi.lastSaved()?.photo).toMatch(/^data:image\/jpeg;base64,/);

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(uploaded).toHaveCount(0);
    await expect(editor.preview.locator("img.resume-photo")).toHaveCount(0);
    await expect(page.getByText("Upload photo")).toBeVisible();
    await expect.poll(() => resumeApi.lastSaved()?.photo).toBe("");
  });

  test("rejects unsupported image types", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await page.locator("#resume-photo").setInputFiles({
      name: "animation.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });

    await expect(page.locator(".photo-error")).toHaveText("Choose a JPG, PNG, or WebP image.");
    await expect(page.getByAltText("Resume profile")).toHaveCount(0);
  });

  test("rejects files that cannot be decoded as an image", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await page.locator("#resume-photo").setInputFiles({
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("this is not a png"),
    });

    await expect(page.locator(".photo-error")).toBeVisible();
    await expect(page.getByAltText("Resume profile")).toHaveCount(0);
  });
});
