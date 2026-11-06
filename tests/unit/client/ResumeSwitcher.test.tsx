import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ResumeSwitcher from "../../../src/client/ResumeSwitcher";
import type { ResumeVersionSummary } from "../../../src/interface/resume";

function version(id: string, title: string): ResumeVersionSummary {
  return { id, title, updatedAt: "2024-01-01T00:00:00.000Z" };
}

const versions = [version("a", "General"), version("b", "Frontend focus")];

function renderSwitcher(overrides: Partial<Parameters<typeof ResumeSwitcher>[0]> = {}) {
  const props = {
    versions,
    activeId: "a",
    isBusy: false,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDuplicate: vi.fn(),
    onRename: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ResumeSwitcher {...props} />);
  return props;
}

const trigger = () => screen.getByRole("button", { name: "Switch resume" });
const menu = () => screen.getByRole("menu", { name: "Your resumes" });

describe("ResumeSwitcher", () => {
  it("shows the active title and the version count", () => {
    renderSwitcher();

    expect(trigger()).toHaveTextContent("General");
    expect(trigger()).toHaveTextContent("2 / 10");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("is disabled until the versions are known", () => {
    renderSwitcher({ versions: [], activeId: null });

    expect(trigger()).toBeDisabled();
    expect(trigger()).toHaveTextContent("Loading resumes...");
  });

  it("is disabled while a version request is running", () => {
    renderSwitcher({ isBusy: true });

    expect(trigger()).toBeDisabled();
  });

  it("opens and closes the menu", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const items = within(menu()).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual(["General", "Frontend focus"]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(items[1]).toHaveAttribute("aria-checked", "false");

    await user.click(trigger());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("selects another version and closes", async () => {
    const user = userEvent.setup();
    const props = renderSwitcher();

    await user.click(trigger());
    await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend focus" }));

    expect(props.onSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not re-select the active version", async () => {
    const user = userEvent.setup();
    const props = renderSwitcher();

    await user.click(trigger());
    await user.click(within(menu()).getByRole("menuitemradio", { name: "General" }));

    expect(props.onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("creates and duplicates from the menu", async () => {
    const user = userEvent.setup();
    const props = renderSwitcher();

    await user.click(trigger());
    await user.click(within(menu()).getByRole("menuitem", { name: "New blank resume" }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);

    await user.click(trigger());
    await user.click(within(menu()).getByRole("menuitem", { name: "Duplicate this resume" }));
    expect(props.onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("disables creating at the version limit", async () => {
    const user = userEvent.setup();
    renderSwitcher({
      versions: Array.from({ length: 10 }, (_, index) => version(`v${index}`, `Resume ${index + 1}`)),
      activeId: "v0",
    });

    expect(trigger()).toHaveTextContent("10 / 10");
    await user.click(trigger());
    expect(within(menu()).getByRole("menuitem", { name: "New blank resume" })).toBeDisabled();
    expect(within(menu()).getByRole("menuitem", { name: "Duplicate this resume" })).toBeDisabled();
    expect(within(menu()).getByRole("menuitem", { name: "New blank resume" })).toHaveAttribute(
      "title",
      "You can keep up to 10 resumes.",
    );
  });

  it("disables deleting the only version", async () => {
    const user = userEvent.setup();
    renderSwitcher({ versions: [versions[0]] });

    await user.click(trigger());
    expect(within(menu()).getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  describe("rename", () => {
    it("submits a cleaned title and closes on success", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      const input = within(menu()).getByLabelText("Resume title");
      expect(input).toHaveValue("General");
      expect(input).toHaveFocus();

      await user.clear(input);
      await user.type(input, "  Backend   roles ");
      await user.click(within(menu()).getByRole("button", { name: "Save title" }));

      expect(props.onRename).toHaveBeenCalledWith("Backend roles");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("submits with the Enter key", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.type(within(menu()).getByLabelText("Resume title"), "!{Enter}");

      expect(props.onRename).toHaveBeenCalledWith("General!");
    });

    it("closes without a request when the title is unchanged", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.click(within(menu()).getByRole("button", { name: "Save title" }));

      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("validates an empty title locally", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.clear(within(menu()).getByLabelText("Resume title"));
      await user.click(within(menu()).getByRole("button", { name: "Save title" }));

      expect(within(menu()).getByRole("alert")).toHaveTextContent(
        "Enter a title of up to 80 characters.",
      );
      expect(within(menu()).getByLabelText("Resume title")).toHaveAttribute("aria-invalid", "true");
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it("stays open when the rename is rejected", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher({ onRename: vi.fn().mockResolvedValue(false) });

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.type(within(menu()).getByLabelText("Resume title"), "!");
      await user.click(within(menu()).getByRole("button", { name: "Save title" }));

      expect(props.onRename).toHaveBeenCalledWith("General!");
      expect(within(menu()).getByLabelText("Resume title")).toBeInTheDocument();
    });

    it("can be cancelled", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.click(within(menu()).getByRole("button", { name: "Cancel" }));

      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  describe("delete", () => {
    it("asks for confirmation before deleting", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Delete" }));
      expect(menu()).toHaveTextContent("Delete General? This cannot be undone.");
      expect(props.onDelete).not.toHaveBeenCalled();

      await user.click(within(menu()).getByRole("button", { name: "Delete resume" }));
      expect(props.onDelete).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("can be cancelled", async () => {
      const user = userEvent.setup();
      const props = renderSwitcher();

      await user.click(trigger());
      await user.click(within(menu()).getByRole("menuitem", { name: "Delete" }));
      await user.click(within(menu()).getByRole("button", { name: "Cancel" }));

      expect(props.onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});
