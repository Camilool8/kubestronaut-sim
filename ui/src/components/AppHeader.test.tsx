import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";
import { HEADER_COMPACT_QUERY } from "../lib/useMediaQuery";
import { matchMediaMock } from "../test/setup";
import { strings } from "../strings";

const renderHeader = render;

beforeEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

describe("AppHeader", () => {
  test("is a banner landmark", () => {
    renderHeader(<AppHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  // The two controls this header replaced were a fixed cluster in the
  // corner. Losing either of them in the move would have taken away the
  // only theme control and the only route to the About drawer, on every
  // screen, silently.
  test("always carries the theme toggle and the About button", () => {
    renderHeader(<AppHeader />);
    expect(screen.getByRole("button", { name: strings.info.open })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });

  describe("brand variant", () => {
    test("names the product and links home", () => {
      renderHeader(<AppHeader />);
      const brand = screen.getByRole("link");
      expect(brand).toHaveTextContent("kubestronaut-sim");
      expect(brand).toHaveAttribute("href", "#/");
    });

    test("shows the crumb and detail beside the mark", () => {
      renderHeader(<AppHeader crumb="Choose an exam" detail="20 tasks" />);
      expect(screen.getByText("Choose an exam")).toBeInTheDocument();
      expect(screen.getByText("20 tasks")).toBeInTheDocument();
    });
  });

  describe("back variant", () => {
    test("replaces the mark with a labelled way out", () => {
      renderHeader(
        <AppHeader variant="back" back={{ label: "Exams", to: "/exams" }} crumb="CKAD" />,
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /exams/i })).toBeInTheDocument();
      expect(screen.getByText("CKAD")).toBeInTheDocument();
    });

    test("the back control navigates", async () => {
      const user = userEvent.setup();
      renderHeader(<AppHeader variant="back" back={{ label: "Exams", to: "/exams" }} />);
      await user.click(screen.getByRole("button", { name: /exams/i }));
      expect(window.location.hash).toBe("#/exams");
    });
  });

  describe("nav", () => {
    test("renders one control per destination and navigates on click", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader nav={[{ label: "History", to: "/progress" }, { label: "Packs", to: "/packs" }]} />,
      );
      const nav = screen.getByRole("navigation", { name: strings.header.navLabel });
      expect(nav).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "History" }));
      expect(window.location.hash).toBe("#/progress");
    });

    // The current section must not be a button: activating it would do
    // nothing, and a control that does nothing is worse than plain text.
    test("the current section is marked, and is not clickable", () => {
      renderHeader(
        <AppHeader nav={[{ label: "History", to: "/progress", current: true }]} />,
      );
      expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
      expect(screen.getByText("History")).toHaveAttribute("aria-current", "page");
    });

    test("no nav element at all when there is nowhere to go", () => {
      renderHeader(<AppHeader nav={[]} />);
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });
  });

  test("renders whatever the caller puts left of the controls", () => {
    renderHeader(
      <AppHeader>
        <span>rebuilding</span>
      </AppHeader>,
    );
    expect(screen.getByText("rebuilding")).toBeInTheDocument();
  });

  describe("session", () => {
    const liveSession = {
      kind: "practical" as const,
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready" as const,
      startedAt: "2026-08-05T09:00:00Z",
      expiresAt: "2026-08-05T19:00:00Z",
      lastSeen: "2026-08-05T09:00:00Z",
    };

    test("carries the login, the countdown and both ways out", () => {
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      expect(screen.getByText("octocat")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: strings.hosted.endSession }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
    });

    // The dialog has to be a sibling of the controls that raise it, not a
    // child. Task 10 puts those controls inside a popover that unmounts on
    // close, and a dialog underneath them would go with it.
    test("raises the confirmation from the header, not from the button", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      await user.click(screen.getByRole("button", { name: strings.hosted.endSession }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(strings.hosted.endConfirmTitle);
      expect(screen.getByRole("banner").contains(dialog)).toBe(false);
    });

    test("shows only sign-out when there is no environment", () => {
      renderHeader(<AppHeader session={{ login: "octocat", onChanged: () => {} }} />);
      expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: strings.hosted.endSession })).toBeNull();
    });
  });

  describe("compact", () => {
    const liveSession = {
      kind: "practical" as const,
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready" as const,
      startedAt: "2026-08-05T09:00:00Z",
      expiresAt: "2026-08-05T19:00:00Z",
      lastSeen: "2026-08-05T09:00:00Z",
    };

    beforeEach(() => matchMediaMock([HEADER_COMPACT_QUERY]));
    afterEach(() => matchMediaMock([]));

    test("puts the nav and the session controls behind one button", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader
          nav={[{ label: "Exams", to: "/exams" }, { label: "Progress", to: "/progress" }]}
          session={{ login: "octocat", session: liveSession, onChanged: () => {} }}
        />,
      );

      expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
      expect(screen.queryByRole("button", { name: strings.hosted.signOut })).toBeNull();

      await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
      expect(screen.getByRole("button", { name: "Exams" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Progress" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: strings.hosted.endSession })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
      expect(screen.getByText("octocat")).toBeInTheDocument();
    });

    // Every control has exactly one accessible name at any width. Rendering
    // both copies and hiding one in CSS would give a screen reader two of
    // each, which is worse than the overflow it would be fixing.
    test("does not render a second copy of anything", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader
          nav={[{ label: "Exams", to: "/exams" }]}
          session={{ login: "octocat", session: liveSession, onChanged: () => {} }}
        />,
      );
      await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
      expect(screen.getAllByRole("button", { name: "Exams" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: strings.hosted.signOut })).toHaveLength(1);
    });

    // The lease is taken back at its cap whatever the candidate is doing.
    // It must never be a tap away.
    test("keeps the countdown, About and the theme control in the bar", () => {
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      const bar = screen.getByRole("banner");
      expect(bar).toHaveTextContent(/left|Ends in|Session over/);
      expect(screen.getByRole("button", { name: strings.info.open })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
    });

    // The dialog is raised from inside the popover and must outlive it.
    test("the end-session confirmation survives the menu closing", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
      await user.click(screen.getByRole("button", { name: strings.hosted.endSession }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(strings.hosted.endConfirmTitle);
      // The menu itself is gone.
      expect(screen.queryByRole("group", { name: strings.header.menuLabel })).toBeNull();
    });
  });
});
