import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";
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
});
