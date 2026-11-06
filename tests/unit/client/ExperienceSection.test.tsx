import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExperienceSection from "../../../src/client/ExperienceSection";
import { createExperience } from "../fixtures/resume";
import { getAllFields, getField } from "../helpers";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ExperienceSection", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a card for each position with title fallback", () => {
    render(
      <ExperienceSection
        experience={[
          createExperience({ role: "Lead Designer" }),
          createExperience({ role: "" }),
        ]}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText("Lead Designer")).toBeInTheDocument();
    expect(screen.getByText("Position 2")).toBeInTheDocument();
    expect(getAllFields("Job title")).toHaveLength(2);
    expect(getAllFields("From")[0]).toHaveAttribute("type", "month");
    expect(getAllFields("To")[0]).toHaveAttribute("type", "month");
    expect(
      screen.getAllByText("Leave blank if you still work here."),
    ).toHaveLength(2);
  });

  it("updates individual fields of the right entry", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const experience = [
      createExperience({ company: "One" }),
      createExperience({ company: "Two" }),
    ];
    render(<ExperienceSection experience={experience} onUpdate={onUpdate} />);

    await user.type(getAllFields("Company")[1], "!");
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [
      experience[0],
      { ...experience[1], company: "Two!" },
    ]);

    await user.type(getAllFields("Job title")[0], "!");
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [
      { ...experience[0], role: "Product Designer!" },
      experience[1],
    ]);

    await user.type(getAllFields("What did you accomplish?")[0], "!");
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [
      {
        ...experience[0],
        description: "Designed and shipped the onboarding flow.!",
      },
      experience[1],
    ]);
  });

  it("updates the month fields", async () => {
    const onUpdate = vi.fn();
    const experience = [createExperience({ from: "", to: "" })];
    render(<ExperienceSection experience={experience} onUpdate={onUpdate} />);

    const user = userEvent.setup();
    await user.type(getField("From"), "2020-01");
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [
      { ...experience[0], from: "2020-01" },
    ]);

    await user.type(getField("To"), "2022-12");
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [
      { ...experience[0], to: "2022-12" },
    ]);
  });

  it("adds and removes positions", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const experience = [createExperience(), createExperience({ role: "Old" })];
    render(<ExperienceSection experience={experience} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "Add experience" }));
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [
      ...experience,
      { company: "", role: "", from: "", to: "", description: "" },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove position 2" }));
    expect(onUpdate).toHaveBeenLastCalledWith("experience", [experience[0]]);
  });

  it("disables the polish button when the description is empty", () => {
    render(
      <ExperienceSection
        experience={[createExperience({ description: "   " })]}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Polish with local AI" }),
    ).toBeDisabled();
  });

  it("polishes a description with the local AI and reports success", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const experience = [
      createExperience({ description: "Did things." }),
      createExperience({ description: "Other things." }),
    ];
    render(<ExperienceSection experience={experience} onUpdate={onUpdate} />);

    const polishButtons = screen.getAllByRole("button", {
      name: "Polish with local AI",
    });
    await user.click(polishButtons[0]);

    // While polishing: loading state is scoped to the first card and all
    // structural actions are locked.
    expect(
      screen.getByRole("button", { name: "Polishing..." }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Polishing position 1...",
    );
    expect(getAllFields("What did you accomplish?")[0]).toBeDisabled();
    expect(getAllFields("What did you accomplish?")[1]).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Add experience" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove position 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove position 2" })).toBeDisabled();

    expect(fetchMock).toHaveBeenCalledWith("/api/polish-experience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Did things." }),
    });

    resolveFetch(jsonResponse({ description: "Delivered things." }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Position 1 polished. Review before using.",
      ),
    );
    expect(onUpdate).toHaveBeenCalledWith("experience", [
      { ...experience[0], description: "Delivered things." },
      experience[1],
    ]);
    expect(
      screen.getAllByRole("button", { name: "Polish with local AI" }),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add experience" })).not.toBeDisabled();
  });

  it("shows the server error message when polishing fails", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Unable to reach Ollama." }, 503),
    );
    render(
      <ExperienceSection
        experience={[createExperience(), createExperience({ role: "" })]}
        onUpdate={onUpdate}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Polish with local AI" })[1],
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to reach Ollama.");
    // Feedback is attached to the card that was polished.
    expect(alert.closest(".repeat-card")).toContainElement(
      screen.getByText("Position 2"),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for malformed responses", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    render(
      <ExperienceSection experience={[createExperience()]} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to polish the description. Please try again.",
    );
  });

  it("handles network failures", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <ExperienceSection experience={[createExperience()]} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(
      screen.getByRole("button", { name: "Polish with local AI" }),
    ).not.toBeDisabled();
  });

  it("uses a generic message for non-Error rejections", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce("offline");
    render(
      <ExperienceSection experience={[createExperience()]} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to polish the description. Please try again.",
    );
  });

  it("clears previous feedback when polishing again", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "First failure" }, 500))
      .mockResolvedValueOnce(jsonResponse({ description: "Better." }));
    render(
      <ExperienceSection experience={[createExperience()]} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Polish with local AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("First failure");

    await user.click(screen.getByRole("button", { name: "Polish with local AI" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Position 1 polished"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
