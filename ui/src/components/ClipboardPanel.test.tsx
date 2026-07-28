import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClipboardPanel } from "./ClipboardPanel";
import { desktopClipboard } from "../lib/desktopClipboard";
import { toastStore } from "./toastStore";
import { ToastLayer } from "./Toast";

beforeEach(() => {
  desktopClipboard.reset();
  toastStore.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClipboardPanel", () => {
  // The reason this panel exists: navigator.clipboard.readText does not
  // exist for web content in Firefox and needs a permission in Chrome, so
  // the one-keystroke paste cannot work for a large share of candidates.
  // Typing (or pasting) into a textarea and pressing Send always works.
  test("sends typed text to the desktop", async () => {
    const user = userEvent.setup();
    const pasted: string[] = [];
    desktopClipboard.connect({ clipboardPasteFrom: (t) => pasted.push(t) });

    render(<ClipboardPanel onClose={() => {}} />);
    await user.type(screen.getByLabelText(/send to the exam desktop/i), "kubectl get pods");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(pasted).toEqual(["kubectl get pods"]);
  });

  test("Send is disabled until there is something to send", () => {
    render(<ClipboardPanel onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("says so plainly when no desktop is connected", async () => {
    const user = userEvent.setup();
    // The panel pushes to the toast store; ToastLayer is what renders it,
    // and in the app it is mounted by App.
    render(
      <>
        <ClipboardPanel onClose={() => {}} />
        <ToastLayer />
      </>,
    );

    await user.type(screen.getByLabelText(/send to the exam desktop/i), "x");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/no desktop connected/i)).toBeInTheDocument();
  });

  test("shows what the desktop copied, and offers to take it", async () => {
    const user = userEvent.setup();
    const writes: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (t: string) => {
          writes.push(t);
        },
      },
    });

    render(<ClipboardPanel onClose={() => {}} />);
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();

    desktopClipboard.receive("nginx:1.29-alpine");
    expect(await screen.findByText("nginx:1.29-alpine")).toBeInTheDocument();

    // A click is a real user gesture — which is exactly what the
    // WebSocket-driven path could never provide, and why the text is
    // held here instead of being written on arrival.
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writes).toEqual(["nginx:1.29-alpine"]);
  });
});
