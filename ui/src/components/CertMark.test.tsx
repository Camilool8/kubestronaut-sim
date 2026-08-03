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
    // Same contract Icon.tsx holds: the certification is already the
    // heading beside the tile, so a mark that could take a name would let
    // a later call site make one load-bearing.
    for (const cert of CERTIFICATIONS) {
      const { container } = render(<CertMark certification={cert} />);
      expect(container.querySelector("svg")!).toHaveAttribute("aria-hidden", "true");
    }
  });

  // The fallback path, and the reason it exists: banks/catalog.yaml can
  // advertise a certification before anyone draws its mark. Rendering
  // nothing has to be the answer, so ExamAvatar can print the acronym
  // instead of leaving a tinted tile empty.
  test("an undrawn certification renders nothing rather than an empty svg", () => {
    for (const unknown of ["LFCS", "CKN", "", undefined]) {
      const { container } = render(<CertMark certification={unknown} />);
      expect(container.querySelector("svg")).toBeNull();
    }
  });

  test("hasCertMark agrees with what actually renders", () => {
    // The two must not drift: ExamAvatar asks hasCertMark whether to
    // print the acronym, and prints it exactly when CertMark draws
    // nothing. If these disagree a card shows both, or neither.
    for (const cert of [...CERTIFICATIONS, "LFCS", "", undefined]) {
      const { container } = render(<CertMark certification={cert} />);
      expect(hasCertMark(cert)).toBe(container.querySelector("svg") !== null);
    }
  });

  test("no mark is a copy of another", () => {
    // Five tiles that differ only by tint would be the typographic
    // avatars again, with a worse contrast story. Geometry is what
    // carries the difference, so assert the geometry actually differs.
    const drawn = CERTIFICATIONS.map((cert) => {
      const { container } = render(<CertMark certification={cert} />);
      return container.querySelector("svg")!.innerHTML;
    });
    expect(new Set(drawn).size).toBe(CERTIFICATIONS.length);
  });
});
