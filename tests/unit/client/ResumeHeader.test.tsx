import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResumeHeader from "../../../src/client/ResumeHeader";
import { createResume } from "../fixtures/resume";

const downloadJson = vi.hoisted(() => vi.fn());
const downloadWord = vi.hoisted(() => vi.fn());

vi.mock("../../../src/util/helper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/util/helper")>();
  return { ...actual, downloadJson, downloadWord };
});

describe("ResumeHeader", () => {
  const printSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("print", printSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderHeader(overrides: Partial<Parameters<typeof ResumeHeader>[0]> = {}) {
    const props = {
      resume: createResume(),
      saveLabel: "Saved",
      isImportingJson: false,
      onJsonImport: vi.fn(),
      ...overrides,
    };
    render(<ResumeHeader {...props} />);
    return props;
  }

  it("shows the breadcrumb and the current save status", () => {
    renderHeader({ saveLabel: "Unsaved changes" });

    expect(screen.getByText("My resumes")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toHaveClass("save-status");
    expect(screen.queryByText("/")).not.toBeInTheDocument();
  });

  it("renders the resume switcher inside the breadcrumb", () => {
    renderHeader({ resumeSwitcher: <button type="button">Switcher</button> });

    const breadcrumb = screen.getByText("My resumes").closest(".breadcrumb");
    expect(breadcrumb).toContainElement(screen.getByRole("button", { name: "Switcher" }));
    expect(breadcrumb).toHaveTextContent("/");
  });

  it("wires the hidden JSON file input to the import handler", async () => {
    const user = userEvent.setup();
    const { onJsonImport } = renderHeader();

    const input = screen.getByLabelText("Import JSON", { selector: "input" });
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "application/json,.json");
    expect(input).not.toBeDisabled();

    await user.upload(
      input,
      new File(["{}"], "resume.json", { type: "application/json" }),
    );

    expect(onJsonImport).toHaveBeenCalledTimes(1);
  });

  it("reflects the importing state", () => {
    renderHeader({ isImportingJson: true });

    const label = screen.getByText("Importing...");
    expect(label).toHaveClass("import-button", "is-loading");
    expect(label).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Importing...", { selector: "input" })).toBeDisabled();
  });

  it("toggles the export menu", async () => {
    const user = userEvent.setup();
    renderHeader();

    const exportButton = screen.getByRole("button", { name: /Export/ });
    expect(exportButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("JSON file")).not.toBeInTheDocument();

    await user.click(exportButton);
    expect(exportButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("JSON file")).toBeInTheDocument();
    expect(screen.getByText("Word document")).toBeInTheDocument();
    expect(screen.getByText("Save as PDF")).toBeInTheDocument();

    await user.click(exportButton);
    expect(exportButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("JSON file")).not.toBeInTheDocument();
  });

  it("downloads the JSON export and closes the menu", async () => {
    const user = userEvent.setup();
    const { resume } = renderHeader();

    await user.click(screen.getByRole("button", { name: /Export/ }));
    await user.click(screen.getByRole("button", { name: /JSON file/ }));

    expect(downloadJson).toHaveBeenCalledWith(resume);
    expect(downloadWord).not.toHaveBeenCalled();
    expect(screen.queryByText("JSON file")).not.toBeInTheDocument();
  });

  it("downloads the Word export and closes the menu", async () => {
    const user = userEvent.setup();
    const { resume } = renderHeader();

    await user.click(screen.getByRole("button", { name: /Export/ }));
    await user.click(screen.getByRole("button", { name: /Word document/ }));

    expect(downloadWord).toHaveBeenCalledWith(resume);
    expect(downloadJson).not.toHaveBeenCalled();
    expect(screen.queryByText("Word document")).not.toBeInTheDocument();
  });

  it("opens the print dialog for the PDF export", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /Export/ }));
    await user.click(screen.getByRole("button", { name: /Save as PDF/ }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Save as PDF")).not.toBeInTheDocument();
  });
});
