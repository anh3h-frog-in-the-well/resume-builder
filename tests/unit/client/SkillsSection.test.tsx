import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SkillsSection from "../../../src/client/SkillsSection";
import { getField } from "../helpers";

describe("SkillsSection", () => {
  it("renders the heading, hint and current skills", () => {
    render(<SkillsSection skills="Figma, Research" onUpdate={vi.fn()} />);

    expect(screen.getByText("Skills & strengths")).toBeInTheDocument();
    expect(
      screen.getByText("Separate each skill with a comma. You can update these anytime."),
    ).toBeInTheDocument();
    expect(getField("Your skills")).toHaveValue("Figma, Research");
  });

  it("reports skill edits through onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<SkillsSection skills="" onUpdate={onUpdate} />);

    await user.type(getField("Your skills"), "F");

    expect(onUpdate).toHaveBeenCalledWith("skills", "F");
  });
});
