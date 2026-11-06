import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../../../src/app/login/page";

const { useSession, signIn, router } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() },
}));

vi.mock("next-auth/react", () => ({ useSession, signIn }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fillCredentials(
  user: ReturnType<typeof userEvent.setup>,
  { email = "alex@example.com", password = "password123" } = {},
) {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText(/^Password/), password);
}

describe("LoginPage", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    useSession.mockReturnValue({ status: "unauthenticated", data: null, update: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sign-in form by default", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to access your saved resume.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Resume builder/ })).toHaveAttribute("href", "/");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText(/^Password/)).not.toHaveAttribute("minlength");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.getByText("New to Resume builder?")).toBeInTheDocument();
  });

  it("switches to the registration form and back", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText("Save your resume and pick up where you left off.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("minlength", "8");
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).not.toBeInTheDocument();
    expect(screen.getByText("Already have an account?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("redirects home as soon as the session is authenticated", () => {
    useSession.mockReturnValue({
      status: "authenticated",
      data: { user: { id: "1" }, expires: "2099-01-01T00:00:00.000Z" },
      update: vi.fn(),
    });
    render(<LoginPage />);

    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("honours a safe callbackUrl when the session is already authenticated", () => {
    window.history.replaceState({}, "", "/login?callbackUrl=%2F%3Ftab%3Dskills");
    useSession.mockReturnValue({
      status: "authenticated",
      data: { user: { id: "1" }, expires: "2099-01-01T00:00:00.000Z" },
      update: vi.fn(),
    });
    render(<LoginPage />);

    expect(router.replace).toHaveBeenCalledWith("/?tab=skills");
  });

  it("signs in with credentials and navigates home", async () => {
    const user = userEvent.setup();
    let resolveSignIn: (value: { ok: boolean }) => void = () => {};
    signIn.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Please wait..." })).toBeDisabled();
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "alex@example.com",
      password: "password123",
      redirect: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    resolveSignIn({ ok: true });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("honours a safe callbackUrl after signing in", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/login?callbackUrl=%2F%3Fsection%3Dskills");
    signIn.mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/?section=skills"));
  });

  it.each([
    "https://evil.example.com",
    "//evil.example.com",
    "javascript:alert(1)",
  ])("ignores the unsafe callbackUrl %s", async (callbackUrl) => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
    signIn.mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });

  it.each([
    ["a failed response", { ok: false, error: "CredentialsSignin" }],
    // Auth.js reports bad credentials with a 200 response and an `error` field.
    ["an OK response carrying an error", { ok: true, error: "CredentialsSignin", url: null }],
  ])("shows an error when the credentials are rejected with %s", async (_label, result) => {
    const user = userEvent.setup();
    signIn.mockResolvedValueOnce(result);
    render(<LoginPage />);

    await fillCredentials(user, { password: "wrong-password" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows a generic error for unexpected sign-in failures", async () => {
    const user = userEvent.setup();
    signIn.mockRejectedValueOnce("network down");
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign in. Please try again.",
    );
  });

  it("registers a new account and signs the user in", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 201));
    signIn.mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Alex Morgan");
    await fillCredentials(user, { email: "new@example.com", password: "longpassword" });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alex Morgan",
        email: "new@example.com",
        password: "longpassword",
      }),
    });
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "new@example.com",
      password: "longpassword",
      redirect: false,
    });
  });

  it("shows the registration API error", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "An account with this email already exists." }, 409),
    );
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Alex");
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("shows a generic error when the registration payload is malformed", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }, 200));
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Alex");
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to create your account.",
    );
  });

  it("tells the user to sign in manually if the post-registration sign-in fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 201));
    signIn.mockResolvedValueOnce({ ok: false });
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Alex");
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account created, but sign-in failed. Please sign in.",
    );
  });

  it("clears the error when switching modes", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValueOnce({ ok: false });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("starts the Google sign-in flow", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(signIn).toHaveBeenCalledWith("google");
  });
});
