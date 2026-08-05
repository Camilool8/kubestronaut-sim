import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { Icon, ICON_NAMES, type IconName } from "./Icon";

describe("Icon", () => {
  // The defect this whole set replaces was invisible to every gate in the
  // repo: eight glyphs rendered from the OS because they sat outside the
  // bundled fonts' unicode-range, and one of them was tofu on Linux. A
  // missing path here would be the same class of silent failure, so every
  // name is asserted to actually draw something.
  test.each(ICON_NAMES)("%s renders drawable geometry", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("path, circle, rect")).not.toBeNull();
  });

  test("every icon is hidden from assistive tech, without exception", () => {
    // Not a stylistic choice. Every icon in this product sits beside
    // .sr-only text or an aria-label on its own button, so an icon that
    // could take a name would let a later call site make one load-bearing.
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
      expect(svg.getAttribute("aria-label")).toBeNull();
    }
  });

  test("icons size on the type they sit in", () => {
    const { container } = render(<Icon name="check" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "1em");
    expect(svg).toHaveAttribute("height", "1em");
  });

  test("stroke follows the current colour, so themes and states come free", () => {
    const { container } = render(<Icon name="chevron-down" />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
  });

  test("the name union and the path map cannot drift apart", () => {
    // A name added to IconName without a path would render an empty svg.
    const declared: IconName[] = [
      "chevron-left",
      "chevron-right",
      "chevron-down",
      "check",
      "cross",
      "flag",
      "flag-filled",
      "copy",
      "grid",
      "keyboard",
      "theme-auto",
      "theme-light",
      "theme-dark",
      "help",
      "menu",
      "chart",
      "user",
      "exit",
      "send",
      "home",
    ];
    expect(new Set(ICON_NAMES)).toEqual(new Set(declared));
  });
});
