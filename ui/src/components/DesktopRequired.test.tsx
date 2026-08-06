import { afterEach, describe, expect, test } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopRequired, gateOverridden, useDesktopGate } from "./DesktopRequired";
import { NARROW_QUERY } from "../lib/useMediaQuery";
import { TOUCH_ONLY_QUERY } from "../lib/deviceCapability";
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

  test("a zoomed or narrowed desktop is offered a way through, not blocked", () => {
    matchMediaMock([NARROW_QUERY]);
    expect(renderHook(() => useDesktopGate()).result.current).toBe("narrow");
  });

  test("a touchscreen laptop counts as a desktop", () => {
    matchMediaMock([]);
    expect(renderHook(() => useDesktopGate()).result.current).toBe("ok");
  });

  test("a wide tablet is blocked, not waved through on width", () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    expect(renderHook(() => useDesktopGate()).result.current).toBe("blocked");
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
    render(
      <DesktopRequired verdict="blocked">
        <button>End Exam</button>
      </DesktopRequired>,
    );
    expect(screen.getByRole("button", { name: "End Exam" })).toBeInTheDocument();
  });

  test("the running session's controls come before the explanation, not after it", () => {
    render(
      <DesktopRequired verdict="narrow">
        <button>End Exam</button>
      </DesktopRequired>,
    );

    const submit = screen.getByRole("button", { name: "End Exam" });
    const why = screen.getByText(/side by side with the questions/i);
    expect(submit.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("continue anyway stays last", () => {
    render(
      <DesktopRequired verdict="narrow">
        <button>End Exam</button>
      </DesktopRequired>,
    );

    const anyway = screen.getByRole("button", { name: /continue anyway/i });
    const why = screen.getByText(/side by side with the questions/i);
    expect(why.compareDocumentPosition(anyway) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
