import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelResizer } from "./PanelResizer";
import { desktopResize } from "../lib/desktopResize";
import { SPLIT_QUERY } from "../lib/useMediaQuery";
import { matchMediaMock } from "../test/setup";

const STORAGE_KEY = "sim.panelWidth";

function renderResizer() {
  return render(
    <div className="exam-body">
      <section id="question-panel" />
      <PanelResizer panelId="question-panel" />
    </div>,
  );
}

function panelWidth() {
  return document.documentElement.style.getPropertyValue("--panel-width");
}

function stubCapture(el: HTMLElement) {
  const set = vi.fn();
  const release = vi.fn();
  Object.assign(el, { setPointerCapture: set, releasePointerCapture: release });
  return { set, release };
}

function pointer(el: HTMLElement, type: string, clientX: number) {
  const ev = new MouseEvent(type, { bubbles: true, clientX, button: 0 });
  Object.defineProperty(ev, "pointerId", { value: 1 });

  act(() => {
    el.dispatchEvent(ev);
  });
}

beforeEach(() => {
  matchMediaMock([SPLIT_QUERY]);
  window.localStorage.clear();
  desktopResize.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PanelResizer suppression", () => {
  test("is absent below the split breakpoint", () => {
    matchMediaMock([]);
    renderResizer();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});

describe("PanelResizer accessibility contract", () => {
  test("declares itself as a vertical separator carrying its own value", () => {
    renderResizer();
    const sep = screen.getByRole("separator");

    expect(sep).toHaveAttribute("aria-orientation", "vertical");
    expect(sep).toHaveAttribute("aria-controls", "question-panel");
    expect(sep).toHaveAttribute("aria-valuenow", "420");
    expect(sep).toHaveAttribute("aria-valuemin", "280");
    expect(sep).toHaveAttribute("aria-valuemax", "600");
    expect(sep).toHaveAccessibleName(/resize/i);
    expect(sep).toHaveAttribute("tabindex", "0");
  });
});

describe("PanelResizer keyboard", () => {
  test("arrows step the width and Shift steps it coarsely", async () => {
    renderResizer();
    const sep = screen.getByRole("separator");
    sep.focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(sep).toHaveAttribute("aria-valuenow", "436");

    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(sep).toHaveAttribute("aria-valuenow", "500");

    await userEvent.keyboard("{ArrowLeft}");
    expect(sep).toHaveAttribute("aria-valuenow", "484");
  });

  test("Home and End pin to the bounds and never pass them", async () => {
    renderResizer();
    const sep = screen.getByRole("separator");
    sep.focus();

    await userEvent.keyboard("{End}");
    expect(sep).toHaveAttribute("aria-valuenow", "600");
    await userEvent.keyboard("{ArrowRight}");
    expect(sep).toHaveAttribute("aria-valuenow", "600");

    await userEvent.keyboard("{Home}");
    expect(sep).toHaveAttribute("aria-valuenow", "280");
    await userEvent.keyboard("{ArrowLeft}");
    expect(sep).toHaveAttribute("aria-valuenow", "280");
  });

  test("Enter does nothing — there is no collapsed state", async () => {
    renderResizer();
    const sep = screen.getByRole("separator");
    sep.focus();
    const before = sep.getAttribute("aria-valuenow");
    await userEvent.keyboard("{Enter}");
    expect(sep).toHaveAttribute("aria-valuenow", before as string);
  });

  test("a whole key burst costs exactly one server-side resize", async () => {
    const hold = vi.spyOn(desktopResize, "hold");
    const release = vi.spyOn(desktopResize, "release");
    renderResizer();
    const sep = screen.getByRole("separator");
    sep.focus();

    for (let i = 0; i < 4; i++) {
      sep.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, repeat: i > 0 }),
      );
    }
    sep.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));

    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("PanelResizer pointer", () => {
  test("captures the pointer so a drag cannot leak into the remote session", () => {
    renderResizer();
    const sep = screen.getByRole("separator");
    const { set, release } = stubCapture(sep);

    pointer(sep, "pointerdown", 500);
    expect(set).toHaveBeenCalledWith(1);

    pointer(sep, "pointerup", 540);
    expect(release).toHaveBeenCalledWith(1);
  });

  test("a drag moves the width and commits it on release", () => {
    renderResizer();
    const sep = screen.getByRole("separator");
    stubCapture(sep);

    pointer(sep, "pointerdown", 500);
    pointer(sep, "pointermove", 560);

    expect(panelWidth()).toBe("480px");

    pointer(sep, "pointerup", 560);
    expect(sep).toHaveAttribute("aria-valuenow", "480");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("480");
  });

  test("a drag holds the desktop's resize for the whole gesture", () => {
    const hold = vi.spyOn(desktopResize, "hold");
    const release = vi.spyOn(desktopResize, "release");
    renderResizer();
    const sep = screen.getByRole("separator");
    stubCapture(sep);

    pointer(sep, "pointerdown", 500);
    pointer(sep, "pointermove", 520);
    pointer(sep, "pointermove", 540);
    pointer(sep, "pointermove", 560);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    pointer(sep, "pointerup", 560);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("double-click resets to the default and forgets the preference", async () => {
    window.localStorage.setItem(STORAGE_KEY, "500");
    renderResizer();
    const sep = screen.getByRole("separator");
    expect(sep).toHaveAttribute("aria-valuenow", "500");

    await userEvent.dblClick(sep);

    expect(sep).toHaveAttribute("aria-valuenow", "420");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("PanelResizer persistence", () => {
  test("restores a stored width", () => {
    window.localStorage.setItem(STORAGE_KEY, "480");
    renderResizer();
    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "480");

    expect(panelWidth()).toBe("480px");
  });

  test.each(["9999", "10", "not-a-number", ""])(
    "falls back to the default for the stored value %j",
    (stored) => {
      window.localStorage.setItem(STORAGE_KEY, stored);
      renderResizer();
      expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "420");
    },
  );
});
