import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { CertMark, CERTIFICATIONS, hasCertMark } from "./CertMark";

describe("CertMark", () => {
  test.each(CERTIFICATIONS)("%s renders drawable geometry", (cert) => {
    const { container } = render(<CertMark certification={cert} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("path, circle, rect")).not.toBeNull();
  });

  test("every mark is hidden from assistive tech, without exception", () => {
    for (const cert of CERTIFICATIONS) {
      const { container } = render(<CertMark certification={cert} />);
      expect(container.querySelector("svg")!).toHaveAttribute("aria-hidden", "true");
    }
  });

  test("an undrawn certification renders nothing rather than an empty svg", () => {
    for (const unknown of ["LFCS", "CKN", "", undefined]) {
      const { container } = render(<CertMark certification={unknown} />);
      expect(container.querySelector("svg")).toBeNull();
    }
  });

  test("hasCertMark agrees with what actually renders", () => {
    for (const cert of [...CERTIFICATIONS, "LFCS", "", undefined]) {
      const { container } = render(<CertMark certification={cert} />);
      expect(hasCertMark(cert)).toBe(container.querySelector("svg") !== null);
    }
  });

  test("no mark is a copy of another", () => {
    const drawn = CERTIFICATIONS.map((cert) => {
      const { container } = render(<CertMark certification={cert} />);
      return container.querySelector("svg")!.innerHTML;
    });
    expect(new Set(drawn).size).toBe(CERTIFICATIONS.length);
  });
});
