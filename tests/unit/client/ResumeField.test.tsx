import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ResumeField from "../../../src/client/ResumeField";

describe("ResumeField", () => {
  it("renders a labelled text input by default", () => {
    render(<ResumeField label="Full name" value="Alex" onChange={() => {}} />);

    const input = screen.getByLabelText("Full name");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("Alex");
    expect(input).not.toBeDisabled();
  });

  it("supports custom input types and placeholders", () => {
    render(
      <ResumeField
        label="Email"
        value=""
        onChange={() => {}}
        type="email"
        placeholder="you@example.com"
      />,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("placeholder", "you@example.com");
  });

  it("calls onChange with the new value as the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ResumeField label="Full name" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("Full name"), "Al");

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, "A");
    // The value prop is controlled and never updated here, so each keystroke
    // reports only the newly typed character.
    expect(onChange).toHaveBeenNthCalledWith(2, "l");
  });

  it("renders a textarea when multiline is set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ResumeField label="About you" value="" onChange={onChange} multiline />,
    );

    const textarea = screen.getByLabelText("About you");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("rows", "4");

    await user.type(textarea, "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("shows the hint only when provided", () => {
    const { rerender } = render(
      <ResumeField label="Skills" value="" onChange={() => {}} />,
    );
    expect(screen.queryByText("Separate with commas")).not.toBeInTheDocument();

    rerender(
      <ResumeField
        label="Skills"
        value=""
        onChange={() => {}}
        hint="Separate with commas"
      />,
    );
    expect(screen.getByText("Separate with commas")).toHaveClass("field-hint");
  });

  it("disables the control when requested", () => {
    render(
      <ResumeField label="Summary" value="" onChange={() => {}} multiline disabled />,
    );

    expect(screen.getByLabelText("Summary")).toBeDisabled();
  });
});
