import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import AuthControl from "../../../src/client/AuthControl";

const { useSession, signOut } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession, signOut }));

type SessionState =
  | { status: "loading"; data: null }
  | { status: "unauthenticated"; data: null }
  | { status: "authenticated"; data: Session };

function setSession(state: SessionState) {
  useSession.mockReturnValue({ ...state, update: vi.fn() });
}

function authenticated(user: Partial<Session["user"]>): SessionState {
  return {
    status: "authenticated",
    data: {
      user: { id: "user-1", ...user },
      expires: "2099-01-01T00:00:00.000Z",
    } as Session,
  };
}

describe("AuthControl", () => {
  it("links to the login page while signed out", () => {
    setSession({ status: "unauthenticated", data: null });
    render(<AuthControl />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveTextContent("Sign in");
    expect(link).toHaveTextContent("Save across devices");
    expect(screen.getByText("?")).toHaveClass("profile-avatar");
  });

  it("shows a loading label while the session is resolving", () => {
    setSession({ status: "loading", data: null });
    render(<AuthControl />);

    expect(screen.getByRole("link")).toHaveTextContent("Loading account...");
  });

  it("treats an authenticated session without a user as signed out", () => {
    useSession.mockReturnValue({
      status: "authenticated",
      data: { expires: "2099-01-01T00:00:00.000Z" },
      update: vi.fn(),
    });
    render(<AuthControl />);

    expect(screen.getByRole("link")).toHaveTextContent("Sign in");
  });

  it("shows the user's name and two-letter initials", () => {
    setSession(authenticated({ name: "alex morgan smith", email: "alex@example.com" }));
    render(<AuthControl />);

    expect(screen.getByText("AM")).toHaveClass("profile-avatar");
    expect(screen.getByText("alex morgan smith")).toBeInTheDocument();
    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("falls back to the email when there is no name", () => {
    setSession(authenticated({ name: null, email: "jo@example.com" }));
    render(<AuthControl />);

    expect(screen.getByText("jo@example.com")).toBeInTheDocument();
    expect(screen.getByText("J")).toHaveClass("profile-avatar");
  });

  it("falls back to a generic label when neither name nor email is known", () => {
    setSession(authenticated({ name: null, email: null }));
    render(<AuthControl />);

    expect(screen.getByText("Your account")).toBeInTheDocument();
    expect(screen.getByText("YA")).toHaveClass("profile-avatar");
  });

  it("falls back to a placeholder avatar when the name has no letters", () => {
    setSession(authenticated({ name: "   ", email: "blank@example.com" }));
    render(<AuthControl />);

    expect(screen.getByText("U")).toHaveClass("profile-avatar");
  });

  it("signs out and redirects home", async () => {
    const user = userEvent.setup();
    setSession(authenticated({ name: "Alex" }));
    signOut.mockResolvedValue(undefined);
    render(<AuthControl />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
