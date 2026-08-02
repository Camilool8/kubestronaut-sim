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
  test("the chain reaches #root, or every screen root's percentage collapses", async () => {
    const css = await readBaseCss();
    const body = ruleBody(css, "html, body, #root");

    expect(body, "the html/body/#root height rule was renamed or removed").not.toBeNull();
    expect(body).toContain("height: 100%");
  });

  // `main` used to be in the rule above. It is now the flexible row of a
  // column, because `.app-header` is its sibling and 100% + a 56px header
  // overflows the viewport. Both halves are asserted: without the column
  // on #root, `flex: 1` means nothing and main collapses to its content.
  test("main takes the space the header leaves, and still has a definite height", async () => {
    const css = await readBaseCss();
    const root = ruleBody(css, "#root");
    const main = ruleBody(css, "main");

    expect(root, "#root's own rule was renamed or removed").not.toBeNull();
    expect(root).toContain("flex-direction: column");
    expect(main).toContain("flex: 1 1 auto");
    expect(
      main,
      "a percentage height here would re-add the header's 56px on top of a full viewport",
    ).not.toContain("height: 100%");
  });

  test("the screen roots that depend on it still ask for a percentage height", async () => {
    // If one of these ever changes to a viewport unit or a fixed height,
    // the rule above stops being load-bearing for it and this pairing
    // should be revisited rather than silently kept.
    const css = await readThemeCss();
    expect(ruleBody(css, ".exam-layout")).toContain("height: 100%");
    // .score-screen deliberately does NOT: it is the one screen that grows
    // past the viewport and lets the PAGE scroll it, so a second scrollbar
    // never appears over twenty-two expanded results. It still asks for a
    // percentage — as a floor, not a cap.
    expect(ruleBody(css, ".score-screen")).toContain("min-height: 100%");
    expect(ruleBody(css, ".score-screen")).not.toContain("overflow-y: auto");
    // `.page` is the shared root of every screen that is a PAGE — the
    // exam selector and the mode selector today. Same reading as
    // .score-screen: a floor, not a cap, so a page taller than the
    // viewport scrolls the document rather than a box inside it.
    expect(ruleBody(css, ".page")).toContain("min-height: 100%");
    expect(ruleBody(css, ".page")).not.toContain("overflow-y: auto");
  });

  // The wrapper is height: 100% for the exam's benefit; without this
  // override the score screen's min-height resolves against a fixed box
  // and the growth has nowhere to go.
  test("the score screen's wrapper is allowed to grow with it", async () => {
    const css = await readThemeCss();
    const body = ruleBody(css, ".screen:has(> .score-screen)");
    expect(body, "the score screen's wrapper override was renamed or removed").not.toBeNull();
    expect(body).toContain("height: auto");
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

  // The other half of the same rule, and the half that was never pinned:
  // the navigator overlays the question panel out of flow. In flow it
  // would be a flex child, its height would move .question-panel's, and
  // .desktop-pane beside it would resize — which costs a framebuffer
  // round-trip on every open. Both of its hosts have to stay positioned
  // for `inset: 0` to mean the panel rather than the viewport.
  test("the question navigator overlays its host instead of displacing it", async () => {
    const css = await readThemeCss();
    const navigator = ruleBody(css, ".navigator");

    expect(navigator, "the navigator's own rule was renamed or removed").not.toBeNull();
    expect(navigator).toContain("position: absolute");
    expect(navigator).toContain("inset: 0");
    expect(ruleBody(css, ".question-panel")).toContain("position: relative");
    expect(ruleBody(css, ".mcq-question")).toContain("position: relative");
  });
});

// The chip row is written by the bank, and a bank writes what it likes.
// `.task-chip` sets `white-space: nowrap`, which is right for "Weight 5%"
// and wrong for the domain: CKAD ships "Application Environment,
// Configuration and Security", and nowrap meant that chip never shrank —
// it ran past the pane's right edge and was clipped, at the 360px default
// as well as at the resizer's 280px floor. jsdom cannot see this; only the
// declaration can be checked here, and the widths were measured live.
describe("the task pane's domain chip", () => {
  test("overrides nowrap so a long curriculum domain wraps instead of clipping", async () => {
    const css = await readThemeCss();
    const chip = ruleBody(css, ".task-chip");
    const domain = ruleBody(css, ".task-chip-domain");

    expect(chip, ".task-chip was renamed or removed").not.toBeNull();
    expect(chip, "this test exists because the base chip refuses to wrap").toContain(
      "white-space: nowrap",
    );
    expect(domain, ".task-chip-domain was renamed or removed").not.toBeNull();
    expect(domain).toContain("white-space: normal");
    // Without min-width: 0 the chip keeps its max-content width as a flex
    // item and wrapping the text changes nothing.
    expect(domain).toContain("min-width: 0");
  });
});
