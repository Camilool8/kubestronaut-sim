import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { usePoll, type PollInterval, type PollOptions } from "./usePoll";

interface PollerProps extends PollOptions {
  fn: () => void | Promise<void>;
  interval: PollInterval;
}

function Poller({ fn, interval, ...options }: PollerProps) {
  usePoll(fn, interval, options);
  return null;
}

// jsdom keeps `hidden` on Document.prototype as a getter, so the only way to
// play a backgrounded tab is to shadow it on the instance and fire the event
// the browser would have fired.
function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  Reflect.deleteProperty(document, "hidden");
  vi.useRealTimers();
});

describe("usePoll cadence", () => {
  test("runs at once, then on its interval, and stops when it is unmounted", async () => {
    const fn = vi.fn();
    const { unmount } = render(<Poller fn={fn} interval={1000} />);

    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fn).toHaveBeenCalledTimes(4);

    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  test("asks for the next wait after every run, so the cadence can change", async () => {
    const fn = vi.fn();
    render(<Poller fn={fn} interval={() => (fn.mock.calls.length < 2 ? 1000 : 5000)} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // The second run chose the slow cadence, so the third is 5s out, not 1s.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("a null wait ends the loop for good", async () => {
    const fn = vi.fn();
    render(<Poller fn={fn} interval={() => (fn.mock.calls.length >= 2 ? null : 1000)} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(2);

    // Not even a return to the tab revives a loop that said it was done.
    window.dispatchEvent(new Event("focus"));
    setHidden(true);
    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a run that throws is not the end of the loop", async () => {
    const fn = vi.fn(async () => {
      throw new Error("the facilitator is not answering");
    });
    render(<Poller fn={fn} interval={1000} />);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("a slow run is never overlapped by the next one", async () => {
    let running = 0;
    let mostAtOnce = 0;
    const fn = vi.fn(async () => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      running -= 1;
    });

    render(<Poller fn={fn} interval={100} />);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(fn.mock.calls.length).toBeGreaterThan(1);
    expect(mostAtOnce).toBe(1);
  });
});

describe("usePoll enabled", () => {
  test("polls nothing while disabled, and starts immediately when enabled", async () => {
    const fn = vi.fn();
    const { rerender } = render(<Poller fn={fn} interval={1000} enabled={false} />);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).not.toHaveBeenCalled();

    rerender(<Poller fn={fn} interval={1000} enabled />);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    rerender(<Poller fn={fn} interval={1000} enabled={false} />);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a new restartKey polls now instead of waiting out the current interval", async () => {
    const fn = vi.fn();
    const { rerender } = render(<Poller fn={fn} interval={10_000} restartKey={0} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);

    rerender(<Poller fn={fn} interval={10_000} restartKey={1} />);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("usePoll in a background tab", () => {
  test("stops polling while the tab is hidden, and picks up again when it is not", async () => {
    const fn = vi.fn();
    render(<Poller fn={fn} interval={1000} />);

    // Establish that the loop is genuinely running before hiding anything —
    // otherwise "no calls while hidden" would prove nothing at all.
    await vi.advanceTimersByTimeAsync(3000);
    expect(fn).toHaveBeenCalledTimes(4);
    const whileVisible = fn.mock.calls.length;

    setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(whileVisible);

    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(whileVisible + 1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fn).toHaveBeenCalledTimes(whileVisible + 4);
  });

  test("a loop enabled while the tab is hidden waits for the tab, then runs", async () => {
    setHidden(true);
    const fn = vi.fn();
    render(<Poller fn={fn} interval={1000} />);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).not.toHaveBeenCalled();

    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("coming back to the window reads again rather than serving a stale wait", async () => {
    const fn = vi.fn();
    render(<Poller fn={fn} interval={10_000} />);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    expect(fn).toHaveBeenCalledTimes(2);

    // ...and the interval restarts from the fresh read.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
