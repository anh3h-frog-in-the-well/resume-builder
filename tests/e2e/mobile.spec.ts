import { signIn } from "./support/auth";
import { EditorPage } from "./support/editor";
import { expect, test } from "./support/fixtures";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.describe("mobile layout", () => {
  test("navigates sections with the mobile tab bar", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    // The sidebar is collapsed on small screens; the tab bar takes over.
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".mobile-section-nav")).toBeVisible();
    await expect(editor.mobileNavLink("Personal details")).toHaveClass(/active/);

    await editor.mobileNavLink("Work experience").click();
    await expect(editor.heading).toHaveText(/^Work experience/);
    await expect(editor.mobileNavLink("Work experience")).toHaveClass(/active/);
    await expect(editor.experienceCards.first()).toBeVisible();

    await editor.mobileNavLink("Skills").click();
    await expect(editor.heading).toHaveText(/^Skills/);
    await expect(editor.field("Your skills")).toBeVisible();
  });

  test("keeps editing and the live preview working", async ({ page, resumeApi }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await editor.field("Full name").fill("Mobile Editor");

    await expect(editor.preview.getByRole("heading", { name: "Mobile Editor" })).toBeAttached();
    await expect.poll(() => resumeApi.lastSaved()?.name).toBe("Mobile Editor");
  });

  test("login page fits the small viewport", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});
