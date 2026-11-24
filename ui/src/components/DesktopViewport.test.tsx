import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { SessionSnapshot } from "../api";
import { strings } from "../strings";
import { toastStore } from "./toastStore";
import { DesktopViewport, ESCALATE_AFTER_ATTEMPTS, ESCALATE_AFTER_MS, isLeaveChord } from "./DesktopViewport";
import { END_EXAM_BUTTON_ID } from "./TimerBar";

const { dials, control } = vi.hoisted(() => ({
  control: { refuse: false },
  dials: [] as Array<{
    listeners: Map<string, Array<() => void>>;
    focused: number;
    fire: (type: string) => void;
  }>,
}));

vi.mock("@novnc/novnc", () => {
  class FakeRFB {
    listeners = new Map<string, Array<() => void>>();
    focused = 0;
    constructor() {
      if (control.refuse) {
        control.refuse = false;
        throw new DOMException("blocked", "SecurityError");
      }
      dials.push(this);
    }
    addEventListener(type: string, fn: () => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    removeEventListener() {}
    disconnect() {}
    focus() {
      this.focused++;
    }
    fire(type: string) {
      for (const fn of this.listeners.get(type) ?? []) fn();
    }
  }
  return { default: FakeRFB };
});

const session: SessionSnapshot = {
  state: "running",
  bank: "ckad-mock-01",
  startedAt: "2026-11-23T09:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 2530,
  endReason: "",
  mode: "exam",
  untimed: false,
};

function latest() {
  return dials[dials.length - 1];
}

function dropAndWait(attempt: number) {
  act(() => latest().fire("disconnect"));
  act(() => {
    vi.advanceTimersByTime(Math.min(1_000 * 2 ** attempt, 8_000));
  });
}

function liveRegion(container: HTMLElement) {
  return container.querySelector('[aria-live="assertive"]') as HTMLElement;
}

beforeEach(() => {
  dials.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  toastStore.clear();
});

describe("DesktopViewport when the connection drops", () => {
  test("says the work is safe and the clock is running, without a toast", () => {
    const { container } = render(<DesktopViewport session={session} fetchedAt={Date.now()} />);
    act(() => latest().fire("connect"));
    act(() => latest().fire("disconnect"));

    expect(screen.getByRole("heading", { name: strings.desktop.lostTitle })).toBeInTheDocument();
    expect(screen.getByText(strings.desktop.lostWorkSafe)).toBeInTheDocument();
    expect(screen.getByText(strings.desktop.lostClockTimed)).toBeInTheDocument();
    expect(screen.getByText("0:42:10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: strings.desktop.reload })).not.toBeInTheDocument();
    expect(liveRegion(container)).toHaveTextContent(strings.desktop.announceLost);
    expect(toastStore.list()).toHaveLength(0);
  });

  test("the live region does not repeat itself on every retry", () => {
    const { container } = render(<DesktopViewport session={session} fetchedAt={Date.now()} />);
    act(() => latest().fire("disconnect"));
    const region = liveRegion(container);
    const first = region.textContent;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(region, { childList: true, subtree: true, characterData: true });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => latest().fire("disconnect"));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    act(() => latest().fire("disconnect"));

    observer.disconnect();
    expect(region.textContent).toBe(first);
    expect(mutations).toHaveLength(0);
  });

  test(`escalates after ${ESCALATE_AFTER_ATTEMPTS} failed attempts and offers a reload of just the pane`, () => {
    const { container } = render(<DesktopViewport session={session} fetchedAt={Date.now()} />);

    for (let i = 0; i < ESCALATE_AFTER_ATTEMPTS - 1; i++) dropAndWait(i);
    expect(dials).toHaveLength(ESCALATE_AFTER_ATTEMPTS);
    expect(screen.queryByRole("button", { name: strings.desktop.reload })).not.toBeInTheDocument();

    act(() => latest().fire("disconnect"));
    const reload = screen.getByRole("button", { name: strings.desktop.reload });
    expect(screen.getByText(strings.desktop.stuckCause)).toBeInTheDocument();
    expect(liveRegion(container)).toHaveTextContent(strings.desktop.announceStuck);

    const before = dials.length;
    fireEvent.click(reload);
    expect(dials.length).toBe(before + 1);

    act(() => latest().fire("connect"));
    expect(screen.queryByRole("heading", { name: strings.desktop.lostTitle })).not.toBeInTheDocument();
    expect(liveRegion(container)).toHaveTextContent(strings.desktop.announceRestored);
  });

  test("escalates on time alone when each attempt hangs", () => {
    render(<DesktopViewport session={session} fetchedAt={Date.now()} />);
    act(() => latest().fire("disconnect"));
    act(() => {
      vi.advanceTimersByTime(ESCALATE_AFTER_MS - 1);
    });
    expect(screen.queryByRole("button", { name: strings.desktop.reload })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: strings.desktop.reload })).toBeInTheDocument();
  });

  test("a connection that cannot even be constructed is retried like a drop", () => {
    control.refuse = true;
    render(<DesktopViewport session={session} fetchedAt={Date.now()} />);
    expect(screen.getByRole("heading", { name: strings.desktop.lostTitle })).toBeInTheDocument();
    expect(dials).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(dials).toHaveLength(1);
  });
});

describe("DesktopViewport keyboard access", () => {
  test("the desktop is reachable with Tab and hands focus to the remote screen", () => {
    render(<DesktopViewport session={session} fetchedAt={Date.now()} />);
    act(() => latest().fire("connect"));
    const desktop = screen.getByRole("group", { name: strings.desktop.regionLabel });
    expect(desktop).toHaveAttribute("tabindex", "0");
    act(() => desktop.focus());
    expect(latest().focused).toBe(1);
  });

  test("the leave chord moves focus out before the desktop sees the key", () => {
    render(<DesktopViewport session={session} fetchedAt={Date.now()} />);
    const desktop = screen.getByRole("group", { name: strings.desktop.regionLabel });
    const inner = document.createElement("canvas");
    desktop.appendChild(inner);
    const reached = vi.fn();
    inner.addEventListener("keydown", reached);

    const event = new KeyboardEvent("keydown", {
      key: "End",
      code: "End",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    inner.dispatchEvent(event);

    expect(reached).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: strings.desktop.skip }));
  });

  test("the skip link lands on Submit without touching the hash route", () => {
    window.location.hash = "#/exam";
    render(
      <>
        <button id={END_EXAM_BUTTON_ID}>Submit exam</button>
        <DesktopViewport session={session} fetchedAt={Date.now()} />
      </>,
    );
    const followed = fireEvent.click(screen.getByRole("link", { name: strings.desktop.skip }));
    expect(followed).toBe(false);
    expect(window.location.hash).toBe("#/exam");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Submit exam" }));
  });

  test("plain End, Ctrl+Shift+End and the old Escape chord stay with the desktop", () => {
    const plain = new KeyboardEvent("keydown", { key: "End" });
    const partial = new KeyboardEvent("keydown", { key: "End", ctrlKey: true, shiftKey: true });
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(isLeaveChord(plain)).toBe(false);
    expect(isLeaveChord(partial)).toBe(false);
    expect(isLeaveChord(escape)).toBe(false);
  });
});
