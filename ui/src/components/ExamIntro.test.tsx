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

    const legend = within(screen.getByRole("list"));
    for (const item of strings.intro.legend) {
      expect(legend.getByText(item.title)).toBeInTheDocument();
      expect(legend.getByText(item.body, { exact: false })).toBeInTheDocument();
    }
    expect(strings.intro.legend).toHaveLength(4);
  });

  test("grading is explained here, and outside the numbered legend", () => {
    render(<ExamIntro onClose={() => {}} />);

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
    localStorage.setItem("sim.tourDone", "1");
    expect(introSeen()).toBe(true);
  });
});
