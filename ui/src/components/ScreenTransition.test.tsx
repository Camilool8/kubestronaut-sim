import { describe, expect, test } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { ScreenTransition } from "./ScreenTransition";

function Page({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <button>Act</button>
    </>
  );
}

describe("ScreenTransition focus", () => {
  test("moving to a new screen puts focus on its h1, not the body", () => {
    const { rerender } = render(
      <ScreenTransition screenKey="idle">
        <Page title="Exams" />
      </ScreenTransition>,
    );
    screen.getByRole("button", { name: "Act" }).focus();

    rerender(
      <ScreenTransition screenKey="idle:mode">
        <Page title="Choose a mode" />
      </ScreenTransition>,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Choose a mode" });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  test("the first screen after the app loads keeps the browser's own starting point", () => {
    const { rerender } = render(
      <ScreenTransition screenKey="loading">
        <p>Loading…</p>
      </ScreenTransition>,
    );
    rerender(
      <ScreenTransition screenKey="idle">
        <Page title="Exams" />
      </ScreenTransition>,
    );
    expect(screen.getByRole("heading", { name: "Exams" })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  test("a re-render of the same screen leaves focus alone", () => {
    const { rerender } = render(
      <ScreenTransition screenKey="idle">
        <Page title="Exams" />
      </ScreenTransition>,
    );
    const act1 = screen.getByRole("button", { name: "Act" });
    act1.focus();
    rerender(
      <ScreenTransition screenKey="idle">
        <Page title="Exams" />
      </ScreenTransition>,
    );
    expect(act1).toHaveFocus();
  });

  test("does not steal focus from something the new screen already focused", () => {
    function Autofocus() {
      useEffect(() => {
        document.getElementById("first")?.focus();
      }, []);
      return (
        <>
          <h1>Exam</h1>
          <button id="first">Start</button>
        </>
      );
    }
    const { rerender } = render(
      <ScreenTransition screenKey="idle:mode">
        <Page title="Mode" />
      </ScreenTransition>,
    );
    rerender(
      <ScreenTransition screenKey="running">
        <Autofocus />
      </ScreenTransition>,
    );
    expect(screen.getByRole("button", { name: "Start" })).toHaveFocus();
  });

  test("waits for a heading that renders after the screen's data arrives", async () => {
    function Late() {
      const [ready, setReady] = useState(false);
      return ready ? (
        <h1>Progress</h1>
      ) : (
        <span role="button" onClick={() => setReady(true)}>
          Load
        </span>
      );
    }
    const { rerender } = render(
      <ScreenTransition screenKey="idle">
        <Page title="Exams" />
      </ScreenTransition>,
    );
    rerender(
      <ScreenTransition screenKey="idle:progress">
        <Late />
      </ScreenTransition>,
    );
    expect(document.body).toHaveFocus();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
    });
    expect(screen.getByRole("heading", { name: "Progress" })).toHaveFocus();
  });
});
