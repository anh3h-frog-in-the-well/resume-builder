import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EducationSection from "../../../src/client/EducationSection";
import { createEducation } from "../fixtures/resume";
import { getAllFields, getField } from "../helpers";

describe("EducationSection", () => {
  it("renders one card per education entry with its index and title", () => {
    render(
      <EducationSection
        education={[
          createEducation({ school: "State University" }),
          createEducation({ school: "" }),
        ]}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("State University")).toBeInTheDocument();
    expect(screen.getByText("Education 2")).toBeInTheDocument();
    expect(getAllFields("School or institution")).toHaveLength(2);
  });

  it("renders nothing but the add button when the list is empty", () => {
    render(<EducationSection education={[]} onUpdate={vi.fn()} />);

    expect(screen.queryByText("01")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add education" }),
    ).toBeInTheDocument();
  });

  it("updates a single entry field while keeping the others untouched", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const education = [
      createEducation({ school: "First" }),
      createEducation({ school: "Second", degree: "MSc" }),
    ];
    render(<EducationSection education={education} onUpdate={onUpdate} />);

    await user.type(getAllFields("Degree or qualification")[1], "!");

    expect(onUpdate).toHaveBeenCalledWith("education", [
      education[0],
      { ...education[1], degree: "MSc!" },
    ]);
  });

  it("updates the dates field", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const education = [createEducation({ dates: "" })];
    render(<EducationSection education={education} onUpdate={onUpdate} />);

    await user.type(getField("Dates"), "2");

    expect(onUpdate).toHaveBeenCalledWith("education", [
      { ...education[0], dates: "2" },
    ]);
  });

  it("appends an empty entry when adding education", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const education = [createEducation()];
    render(<EducationSection education={education} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "Add education" }));

    expect(onUpdate).toHaveBeenCalledWith("education", [
      education[0],
      { school: "", degree: "", dates: "" },
    ]);
  });

  it("removes the selected entry", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const education = [
      createEducation({ school: "Keep" }),
      createEducation({ school: "Remove" }),
    ];
    render(<EducationSection education={education} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "Remove education 2" }));

    expect(onUpdate).toHaveBeenCalledWith("education", [education[0]]);
  });
});
