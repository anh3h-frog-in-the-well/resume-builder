import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Icon from "../../../src/client/Icon";
import { iconPaths } from "../../../src/util/helper";

describe("Icon", () => {
  it("renders a decorative svg with the default size", () => {
    const { container } = render(<Icon name="user" />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("applies a custom size", () => {
    const { container } = render(<Icon name="plus" size={32} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it.each(Object.keys(iconPaths))("renders the %s icon paths", (name) => {
    const { container } = render(<Icon name={name} />);

    expect(container.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
  });

  it("falls back to the file icon for unknown names", () => {
    const { container: unknown } = render(<Icon name="does-not-exist" />);
    const { container: file } = render(<Icon name="file" />);

    expect(unknown.querySelector("svg")?.innerHTML).toBe(
      file.querySelector("svg")?.innerHTML,
    );
  });
});
