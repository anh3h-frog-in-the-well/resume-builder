import { createSessionCookie, sessionCookieName, signIn } from "./support/auth";
import { e2eBaseUrl, e2eUser } from "./support/env";
import { expect, fakeVersion, test } from "./support/fixtures";
import { sampleResume } from "./support/resume";
import type { Page } from "@playwright/test";

/** Next.js adds its own live region with role="alert"; scope to the form. */
const authAlert = (page: Page) => page.locator(".auth-card").getByRole("alert");

test.describe("access control", () => {
  test("redirects signed-out visitors from the editor to the login page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2F$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("rejects unauthenticated resume API calls with 401", async ({ request }) => {
    const response = await request.get("/api/resumes");

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication is required to edit your resume.",
    });
  });

  test("lets a signed-in user open the editor", async ({ page, context }) => {
    await signIn(context);

    await page.goto("/");

    await expect(page).toHaveURL(`${e2eBaseUrl}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Personal details/);
    // The account card in the sidebar reflects the session.
    await expect(page.locator(".profile-button")).toContainText(e2eUser.name);
    await expect(page.locator(".profile-button")).toContainText("Signed in");
    await expect(page.locator(".profile-avatar")).toHaveText("EE");
  });

  test("sends an already signed-in user from the login page to the editor", async ({
    page,
    context,
  }) => {
    await signIn(context);

    await page.goto("/login");

    await expect(page).toHaveURL(`${e2eBaseUrl}/`);
  });
});

test.describe("sign in with email and password", () => {
  test("shows an error for rejected credentials", async ({ page }) => {
    await page.route("**/api/auth/callback/credentials**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `${e2eBaseUrl}/login?error=CredentialsSignin` }),
      }),
    );
    await page.goto("/login");

    await page.getByLabel("Email").fill("erin@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(authAlert(page)).toHaveText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  });

  test("signs in and lands on the editor", async ({ page, context, resumeApi }) => {
    resumeApi.reset({ versions: [fakeVersion({}, sampleResume({ name: "Max Mustermann" }))], isNew: true });
    const credentialPosts: URLSearchParams[] = [];
    await page.route("**/api/auth/callback/credentials**", async (route) => {
      credentialPosts.push(new URLSearchParams(route.request().postData() ?? ""));
      // Simulate Auth.js setting the session cookie on a successful sign-in.
      await context.addCookies([await createSessionCookie()]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `${e2eBaseUrl}/` }),
      });
    });
    await page.goto("/login");

    await page.getByLabel("Email").fill("erin@example.com");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(`${e2eBaseUrl}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Personal details/);
    // A new account: the sample resume created by the server is shown.
    await expect(page.getByLabel(/^Full name/)).toHaveValue("Max Mustermann");
    await expect(page.locator(".save-status")).toHaveText("New draft");
    expect(resumeApi.loads).toBeGreaterThanOrEqual(1);

    expect(credentialPosts).toHaveLength(1);
    expect(credentialPosts[0].get("email")).toBe("erin@example.com");
    expect(credentialPosts[0].get("password")).toBe("correct-password");
    expect(credentialPosts[0].get("csrfToken")).toBeTruthy();
  });

  test("returns to the originally requested page after signing in", async ({
    page,
    context,
  }) => {
    await page.route("**/api/auth/callback/credentials**", async (route) => {
      await context.addCookies([await createSessionCookie()]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `${e2eBaseUrl}/` }),
      });
    });
    await page.goto("/login?callbackUrl=%2F%3Ffrom%3Dtest");

    await page.getByLabel("Email").fill("erin@example.com");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(`${e2eBaseUrl}/?from=test`);
  });

  test("requires an email and password before submitting", async ({ page }) => {
    let submitted = false;
    await page.route("**/api/auth/callback/credentials**", (route) => {
      submitted = true;
      return route.fulfill({ status: 500, body: "" });
    });
    await page.goto("/login");

    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // Native form validation blocks the submission.
    const emailInvalid = await page
      .getByLabel("Email")
      .evaluate((element: HTMLInputElement) => !element.validity.valid);
    expect(emailInvalid).toBe(true);
    expect(submitted).toBe(false);
  });

  test("starts the Google OAuth flow from the sign-in button", async ({ page }) => {
    let signInRequest: string | null = null;
    await page.route("**/api/auth/signin/google**", (route) => {
      signInRequest = route.request().postData();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `${e2eBaseUrl}/login?provider=google` }),
      });
    });
    await page.goto("/login");

    await page.getByRole("button", { name: "Sign in with Google" }).click();

    await expect(page).toHaveURL(/provider=google/);
    expect(signInRequest).toContain("csrfToken=");
  });
});

test.describe("create an account", () => {
  test("switches between sign-in and registration", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeHidden();

    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeHidden();
  });

  test("registers, signs in and opens a new draft", async ({ page, context, resumeApi }) => {
    resumeApi.reset({ versions: [fakeVersion({}, sampleResume({ name: "Max Mustermann" }))], isNew: true });
    let registration: unknown;
    await page.route("**/api/register", (route) => {
      registration = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route("**/api/auth/callback/credentials**", async (route) => {
      await context.addCookies([await createSessionCookie()]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `${e2eBaseUrl}/` }),
      });
    });
    await page.goto("/login");

    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Name").fill("Erin Example");
    await page.getByLabel("Email").fill("erin@example.com");
    await page.getByLabel("Password").fill("a-long-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(`${e2eBaseUrl}/`);
    await expect(page.locator(".save-status")).toHaveText("New draft");
    expect(resumeApi.loads).toBeGreaterThanOrEqual(1);
    expect(registration).toEqual({
      name: "Erin Example",
      email: "erin@example.com",
      password: "a-long-password",
    });
  });

  test("shows the server's error when the email is taken", async ({ page }) => {
    await page.route("**/api/register", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "An account with this email already exists." }),
      }),
    );
    await page.goto("/login");

    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Name").fill("Erin Example");
    await page.getByLabel("Email").fill("erin@example.com");
    await page.getByLabel("Password").fill("a-long-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(authAlert(page)).toHaveText(
      "An account with this email already exists.",
    );
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("enforces the minimum password length in the browser", async ({ page }) => {
    let submitted = false;
    await page.route("**/api/register", (route) => {
      submitted = true;
      return route.fulfill({ status: 500, body: "" });
    });
    await page.goto("/login");

    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Name").fill("Erin Example");
    await page.getByLabel("Email").fill("erin@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    const tooShort = await page
      .getByLabel("Password")
      .evaluate((element: HTMLInputElement) => element.validity.tooShort);
    expect(tooShort).toBe(true);
    expect(submitted).toBe(false);
  });
});

test.describe("sign out", () => {
  test("clears the session and returns to the login page", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/");
    await expect(page.locator(".profile-button")).toContainText("Signed in");
    // Let the session provider's initial polling settle so a late response
    // cannot re-issue the cookie after sign-out.
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2F$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === sessionCookieName)).toBeUndefined();

    // The server no longer recognises the browser.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2F$/);
  });
});
