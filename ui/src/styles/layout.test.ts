import { describe, expect, test } from "vitest";
import { readBaseCss, readThemeCss, ruleBody } from "../test/readCss";

// Two declarations that look cosmetic and are not. Both were regressions
// once — the second one for the whole of milestones C through F — and
// neither is visible to a render test, because jsdom has no CSS engine and
// no layout: `getComputedStyle` cannot tell you that a percentage height
// silently resolved to `auto` five ancestors up. Reading the source text is
// a weak check, but it is the only automated one short of a browser, and it
// fails loudly if someone deletes the rule while tidying.

describe("full-height chain", () => {
  test("main carries a height, or every screen root's percentage collapses", async () => {
    const css = await readBaseCss();
    const body = ruleBody(css, "html, body, #root, main");

    expect(body, "the html/body/#root/main height rule was renamed or removed").not.toBeNull();
    expect(body).toContain("height: 100%");
  });

  test("the screen roots that depend on it still ask for a percentage height", async () => {
    // If one of these ever changes to a viewport unit or a fixed height,
    // the rule above stops being load-bearing for it and this pairing
    // should be revisited rather than silently kept.
    const css = await readThemeCss();
    expect(ruleBody(css, ".exam-layout")).toContain("height: 100%");
    expect(ruleBody(css, ".score-screen")).toContain("height: 100%");
    expect(ruleBody(css, ".start-screen")).toContain("min-height: 100%");
  });
});

describe("desktop viewport", () => {
  test("the noVNC mount is out of flow, so it can never size itself from its canvas", async () => {
    // noVNC observes this element and asks the server for a framebuffer of
    // exactly its size, then draws a canvas of that size back into it. In
    // normal flow that is a feedback loop and the remote desktop visibly
    // strobes. `position: absolute` makes the loop impossible: the box's
    // size comes only from its positioned ancestor.
    const css = await readThemeCss();
    const body = ruleBody(css, ".desktop-canvas");

    expect(body).toContain("position: absolute");
    expect(body).toContain("inset: 0");
    expect(body, "flex sizing would let the canvas drive the box again").not.toContain(
      "flex: 1",
    );
  });

  test("its ancestor is positioned, so inset: 0 resolves against the pane", async () => {
    const css = await readThemeCss();
    expect(ruleBody(css, ".desktop-viewport")).toContain("position: relative");
  });
});
