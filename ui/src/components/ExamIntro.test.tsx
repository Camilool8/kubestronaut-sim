import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamIntro, introSeen, markIntroSeen, resetIntroSeen } from "./ExamIntro";
import { strings } from "../strings";

beforeEach(() => {
  resetIntroSeen();
});

describe("ExamIntro", () => {
  test("explains all four regions of the exam screen", () => {
    render(<ExamIntro onClose={() => {}} />);

    // The regression this guards is the one that killed the tour it
    // replaced: half its steps rendered off-screen, so half the exam was
    // never explained. Here every legend entry is in the document or the
    // test fails — there is no positioning that can hide one.
    //
    // Scoped to the legend list because two of the titles deliberately
    // also appear as labels inside the schematic.
    const legend = within(screen.getByRole("list"));
    for (const item of strings.intro.legend) {
      expect(legend.getByText(item.title)).toBeInTheDocument();
      expect(legend.getByText(item.body, { exact: false })).toBeInTheDocument();
    }
    expect(strings.intro.legend).toHaveLength(4);
  });

  test("grading is explained here, and outside the numbered legend", () => {
    render(<ExamIntro onClose={() => {}} />);

    // This moved out of the task pane, where it was the same paragraph
    // under all 22 tasks. It must NOT become a fifth legend entry: those
    // numbers key to the four regions drawn on the schematic, and grading
    // is not a region of the screen.
    const note = screen.getByRole("region", { name: strings.intro.methodTitle });
    expect(note).toHaveTextContent(/state you leave behind/i);
    expect(note).toHaveTextContent(/never the commands you typed/i);
    expect(within(screen.getByRole("list")).queryByText(strings.intro.methodTitle)).toBeNull();
  });

  test("the schematic has an accessible name, not just boxes", () => {
    render(<ExamIntro onClose={() => {}} />);
    expect(screen.getByRole("img", { name: /question panel/i })).toBeInTheDocument();
  });

  test("the confirm button closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ExamIntro onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: strings.intro.done }));

    expect(onClose).toHaveBeenCalled();
  });

  test("opening it does not scroll the card past its own diagram", () => {
    // The card is taller than a short window, so the dialog scrolls
    // internally. Focusing the first control also scrolls it into view,
    // and the first control is the button at the bottom — which opened
    // the card already scrolled past its title and schematic. Focus must
    // still land on the button; only the scroll may not happen.
    //
    // jsdom has no layout and no scrollIntoView, so the option passed to
    // focus() is the only observable part of this here; the visible
    // behaviour was confirmed in a real browser at 1100x617.
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    render(<ExamIntro onClose={() => {}} />);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  test("Escape closes it — it inherits Dialog's focus trap", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ExamIntro onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });
});

describe("seen flag", () => {
  test("starts unseen, marks, and resets", () => {
    expect(introSeen()).toBe(false);
    markIntroSeen();
    expect(introSeen()).toBe(true);
    resetIntroSeen();
    expect(introSeen()).toBe(false);
  });

  test("reuses the key the tour stored, so upgraders are not re-prompted", () => {
    // Renaming the component must not re-show a card an existing user
    // already dismissed. The stored key is deliberately unchanged.
    localStorage.setItem("sim.tourDone", "1");
    expect(introSeen()).toBe(true);
  });
});
