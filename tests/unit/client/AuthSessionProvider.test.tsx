import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthSessionProvider from "../../../src/client/AuthSessionProvider";

const SessionProvider = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  SessionProvider: (props: { children: React.ReactNode }) => {
    SessionProvider(props);
    return <div data-testid="session-provider">{props.children}</div>;
  },
}));

describe("AuthSessionProvider", () => {
  it("wraps its children in the next-auth SessionProvider", () => {
    render(
      <AuthSessionProvider>
        <p>child content</p>
      </AuthSessionProvider>,
    );

    expect(SessionProvider).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-provider")).toContainElement(
      screen.getByText("child content"),
    );
  });
});
