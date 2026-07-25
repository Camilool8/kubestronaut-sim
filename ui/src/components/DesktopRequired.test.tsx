import { afterEach, describe, expect, test } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopRequired, gateOverridden, useDesktopGate } from "./DesktopRequired";
import { NARROW_QUERY, TOUCH_ONLY_QUERY } from "../lib/useMediaQuery";
import { matchMediaMock } from "../test/setup";

afterEach(() => {
  localStorage.clear();
  matchMediaMock([]);
});

describe("useDesktopGate", () => {
  test("a roomy desktop is never gated", () => {
    matchMediaMock([]);
    expect(renderHook(() => useDesktopGate()).result.current).toBe("ok");
  });

  test("a phone is blocked outright", () => {
    matchMediaMock([NARROW_QUERY, TOUCH_ONLY_QUERY]);
    expect(renderHook(() => useDesktopGate()).result.current).toBe("blocked");
  });

  // The case a width-only check gets wrong. WCAG 1.4.10 defines 320 CSS
  // px as equivalent to a 1280px window at 400% zoom, so gating on width
  // alone would lock out exactly the users who depend on that zoom.
  test("a zoomed or narrowed desktop is offered a way through, not blocked", () => {
    matchMediaMock([NARROW_QUERY]); // narrow, but a fine pointer exists
    expect(renderHook(() => useDesktopGate()).result.current).toBe("narrow");
  });

  test("a touchscreen laptop counts as a desktop", () => {
    // It reports a coarse pointer AND a fine one, so TOUCH_ONLY_QUERY
    // does not match and the exam stays available.
    matchMediaMock([]);
    expect(renderHook(() => useDesktopGate()).result.current).toBe("ok");
  });
});

describe("DesktopRequired", () => {
  test("explains the constraint with a real heading", () => {
    render(<DesktopRequired verdict="blocked" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/desktop/i);
  });

  test("a narrowed desktop can continue anyway; a phone cannot", async () => {
    const { unmount } = render(<DesktopRequired verdict="narrow" />);
    await userEvent.click(screen.getByRole("button", { name: /continue anyway/i }));
    expect(gateOverridden()).toBe(true);
    unmount();

    localStorage.clear();
    render(<DesktopRequired verdict="blocked" />);
    expect(screen.queryByRole("button", { name: /continue anyway/i })).not.toBeInTheDocument();
  });

  test("a running session's controls stay reachable through the gate", () => {
    // The server-side clock keeps counting on a phone, so there must
    // always be a way to submit.
    render(
      <DesktopRequired verdict="blocked">
        <button>End Exam</button>
      </DesktopRequired>,
    );
    expect(screen.getByRole("button", { name: "End Exam" })).toBeInTheDocument();
  });
});
