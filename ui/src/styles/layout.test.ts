import { describe, expect, test } from "vitest";
import { readBaseCss, readThemeCss, ruleBody, usedClassNames } from "../test/readCss";

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

  // The dvh half of the same rule, and the ORDER is the whole of it. A
  // browser that does not parse `100dvh` drops that declaration and
  // keeps the `100%` above it, so the fallback is the cascade rather
  // than an @supports block. Swap the two and every such browser gets a
  // chain that resolves to auto — the failure the test above exists for,
  // reintroduced by a tidy-up that sorted the declarations.
  test("the chain also tracks the dynamic viewport, with the percentage as its fallback", async () => {
    const css = await readBaseCss();
    const body = ruleBody(css, "html, body, #root")!;

    expect(
      body,
      "mobile Safari resolves a percentage height against the LARGE viewport, so the bottom of every screen sits under the URL bar",
    ).toContain("height: 100dvh");
    expect(
      body.indexOf("height: 100%"),
      "100% must come FIRST — it is the fallback a browser keeps when it cannot parse dvh",
    ).toBeLessThan(body.indexOf("height: 100dvh"));
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

// `.navbar` is a sibling of `main` inside #root's column flex, so
// `height: 56px` here is only a flex BASE size — with the default shrink
// factor the score screen's 1500px of results squashed it to its
// min-content height (29px, the label text) while the lobby, whose
// content fits, kept the full 56. A header that is a different height
// depending on how long the page below it is. Neither half is visible to
// a render test: jsdom has no layout engine to shrink it in the first
// place.
describe("the navbar does not shrink with the page below it", () => {
  test("keeps its 56px base and refuses to give it up", async () => {
    const css = await readThemeCss();
    const bar = ruleBody(css, ".navbar");

    expect(bar, "the navbar's own rule was renamed or removed").not.toBeNull();
    expect(bar).toContain("height: 56px");
    expect(bar).toContain("flex-shrink: 0");
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

// Moved here from screens/Explain.test.tsx, where they were written only
// because a file-lane boundary once separated theme.css from this file.
// Every declaration below is load-bearing rather than cosmetic, none is
// visible to a render test, and each target selector appears verbatim at
// the top level of theme.css.
//
// `ruleBody` finds the FIRST rule whose selector list matches, and it is
// blind to nesting — an @media block is not a boundary to it, only a
// later position in the file. Two of the selectors below (.explain-nav,
// .explain-solution) also have a twin inside the 600px query, and both
// twins sit AFTER their base rule, so the base rule is what is read. If
// that section is ever reordered, assert on a selector that has no twin
// rather than on the one that moved.
describe("the explanation deep dive", () => {
  test("the document panes stay on the machine palette", async () => {
    const css = await readThemeCss();
    // THE MACHINE IS NOT THE APP. These panes show a cluster, so they are
    // dark in BOTH themes; repointing them at --surface would make the
    // one surface in the product that must not follow the theme follow it.
    expect(ruleBody(css, ".explain-pane-body")).toContain("background: var(--machine-bg)");
  });

  test("a highlighted line spans the whole scroll width, not the visible box", async () => {
    const css = await readThemeCss();
    // A block child of an overflow-x box is only as wide as the visible
    // box, so without this every tint is cut off at the scroll edge and a
    // long line reads as half-changed.
    expect(ruleBody(css, ".explain-pane-body code")).toContain("min-width: 100%");
    expect(ruleBody(css, ".explain-line")).toContain("display: block");
  });

  test("the diff gutter is not part of what a candidate copies out", async () => {
    const css = await readThemeCss();
    // The expected pane is a document people will paste into a file.
    expect(ruleBody(css, ".explain-line-mark")).toContain("user-select: none");
  });

  // A bank writes the titles, and CKAD's are sentences: "Expose a
  // Deployment through an Ingress with a path rewrite" is three lines in
  // this column, and the domain that rides the eyebrow above it is
  // "Application Environment, Configuration and Security". Every one of
  // these is the only thing on screen saying which task is being read, so
  // none of them may be cut. jsdom cannot see an ellipsis; the
  // declaration's absence is the only automated check there is.
  test("nothing that names a task is allowed to truncate", async () => {
    const css = await readThemeCss();
    for (const selector of [
      ".explain-title",
      ".explain-eyebrow",
      ".explain-section-title",
      ".explain-check-title",
    ]) {
      const body = ruleBody(css, selector);
      expect(body, `${selector} was renamed or removed`).not.toBeNull();
      expect(body, `${selector} must not clip a bank-authored string`).not.toContain(
        "text-overflow",
      );
      expect(body).not.toContain("white-space: nowrap");
      expect(body).not.toContain("line-clamp");
    }
  });

  // The other half of the same rule. The header is a flex row with the
  // title block on the left and the prev/next steppers on the right; as a
  // shrinkable item the nav gave its width back to a wrapping title until
  // "Task 12" broke across two lines inside its own button. Refusing to
  // shrink hands the conflict to the row's own flex-wrap instead.
  test("a three-line title cannot squeeze the steppers", async () => {
    const css = await readThemeCss();
    expect(ruleBody(css, ".explain-head")).toContain("flex-wrap: wrap");
    expect(ruleBody(css, ".explain-head")).toContain("align-items: flex-start");
    expect(ruleBody(css, ".explain-nav")).toContain("flex: 0 0 auto");
  });

  // The reference solution is the only place in the product that says how
  // a task should have been done, and the card it sits in is 960px — a
  // measure the panes above it need and prose does not. The cap is on the
  // PROSE children only, so listings and tables keep the full width.
  test("the solution's sentences are capped at a measure and its listings are not", async () => {
    const css = await readThemeCss();
    const prose = ruleBody(
      css,
      `.explain-solution .md > p,
       .explain-solution .md > ul,
       .explain-solution .md > ol,
       .explain-solution .md > blockquote,
       .explain-solution .md > h1,
       .explain-solution .md > h2,
       .explain-solution .md > h3,
       .explain-solution .md > h4,
       .explain-solution .md > h5,
       .explain-solution .md > h6`,
    );

    expect(prose, "the solution's prose measure rule was renamed or removed").not.toBeNull();
    expect(prose).toContain("max-width: var(--explain-measure)");
    // Declared once on the screen root, so the three places that read at
    // this measure cannot drift apart.
    expect(ruleBody(css, ".explain")).toContain("--explain-measure");
    // A cap on `.md` itself would take the code blocks with it.
    expect(ruleBody(css, ".explain-solution")).not.toContain("max-width");
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

// The tips sheet is a document, not a question. Both claims below were
// measured in a browser; jsdom can only see the declarations.
describe("the exam tips sheet", () => {
  test("is wider than a confirm dialog, because it is read rather than answered", async () => {
    const css = await readThemeCss();

    // 560px is the right measure for a sentence and two buttons. The tips
    // are pipe tables and command lines like
    // `k create cj nightly --image=... --schedule='0 2 * * *'`, and every
    // one of those wraps or scrolls sideways at that width — which is
    // exactly the retyping the page exists to save.
    expect(ruleBody(css, ".confirm-dialog-wide"), "the base wide dialog was renamed").toContain(
      "min(560px",
    );
    expect(ruleBody(css, ".confirm-dialog-wide:has(> .tips-body)")).toContain("min(760px");
  });

  test("does not open a second scroll container inside the dialog", async () => {
    const css = await readThemeCss();

    // `.confirm-dialog` already scrolls (max-height + overflow-y). A body
    // that scrolled too would give a long document two nested scrollbars,
    // and the browser's Find, Home and End would all apply to the wrong
    // one — the bug `.screen:has(> .score-screen)` exists to have fixed
    // on the score screen.
    expect(ruleBody(css, ".confirm-dialog")).toContain("overflow-y: auto");
    expect(ruleBody(css, ".tips-body")).not.toContain("overflow");
    expect(ruleBody(css, ".tips-body")).not.toContain("max-height");
  });
});

// A value chip breaks differently depending on whether anything around
// it can grow. Both rules are load-bearing and jsdom can see neither.
describe("value chips that are too long for their column", () => {
  test("break anywhere in a panel, but keep the token whole in a table", async () => {
    const css = await readThemeCss();

    // The narrow-panel case: a 31-character /opt/course path in a task
    // pane dragged to its 280px floor has nowhere to grow, so breaking
    // inside the chip beats pushing the pane sideways.
    expect(ruleBody(css, ".copy-value code")).toContain("overflow-wrap: anywhere");

    // The table case is the opposite: `anywhere` also collapses the
    // cell's intrinsic minimum, which squeezed the exam tips' symptom
    // column until it rendered "ImagePullBackOf" and a lone "f".
    // `break-word` lets the column size to the token instead.
    expect(ruleBody(css, ".md th code, .md td code")).toContain("overflow-wrap: break-word");
  });
});

/**
 * The touch layer, which is entirely made of overrides.
 *
 * Every rule in theme.css's `touch input` section restyles a component
 * defined hundreds of lines above it, and it does so by naming that
 * component's class. A class that has been renamed — or was mistyped in
 * the first place — produces no error, no warning and no visible change
 * on any machine a developer is likely to be using. It simply does
 * nothing, on phones, forever.
 *
 * This caught two on the day it was written: `.exam-card-action` for
 * `.exam-card-actions`, and `.header-menu-trigger` for
 * `.header-menu-button`.
 */
/**
 * The stylesheet is structurally whole.
 *
 * A selector list that runs into an at-rule instead of into a `{` is
 * invalid CSS, and every downstream tool treats it as a warning rather
 * than an error: esbuild prints `Unexpected "@media"` in the middle of a
 * successful build, drops the rule, and ships. Nothing fails, the bundle
 * is smaller by one rule, and the behaviour that rule carried is simply
 * gone.
 *
 * That is exactly what happened to the touch layer here: a scripted edit
 * matched a selector list whose closing line had already been removed by
 * an earlier one, so the replacement silently no-opped and left
 * `.info-button,\n.theme-toggle,` hanging in front of a media query.
 * `touch-action: manipulation` and the tap-highlight reset stopped
 * shipping, on phones, and the "still in the stylesheet" test below
 * passed anyway — a `toContain(".nav-menu-item")` is satisfied by that
 * class appearing in ANY rule, including its own.
 *
 * Braces balancing is not enough either: the file balanced.
 */
describe("theme.css is structurally whole", () => {
  test("no selector list runs into an at-rule, a close brace or the end of the file", async () => {
    const css = await readThemeCss();
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

    const dangling = [...withoutComments.matchAll(/,\s*(?=@|\}|$)/g)].map((m) =>
      withoutComments.slice(Math.max(0, m.index - 120), m.index + 40).trim(),
    );

    expect(dangling, "a selector list with no declaration block — esbuild drops the rule and only warns").toEqual([]);
  });

  test("every brace opened is closed, and none closes early", async () => {
    const css = await readThemeCss();
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    let wentNegative = false;
    for (const ch of withoutComments) {
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth < 0) wentNegative = true;
      }
    }
    expect(wentNegative, "a stray closing brace ends a block early").toBe(false);
    expect(depth, "an unclosed block swallows every rule after it").toBe(0);
  });
});

describe("the touch layer names classes that exist", () => {
  // The classes the touch section targets, listed here rather than
  // parsed out of the CSS: a test that derives its expectations from the
  // thing it is testing cannot fail.
  const targeted = [
    "btn",
    "btn-primary",
    "mcq-option",
    "navigator-tile",
    "navigator-chip",
    "question-mark",
    "info-button",
    "nav-menu-trigger",
    "nav-menu-panel",
    "nav-menu-item",
    // The mobile chrome block at the foot of the file, which is the same
    // kind of override and fails the same silent way. `.signin-cta` was
    // written here first and does not exist; the button is
    // `.signin-github`.
    "page",
    "score-screen",
    "signin",
    "signin-github",
    "page",
    "signin",
    "hosted-flavour-actions",
    "hosted-booting",
    "score-actions",
    "desktop-required-anyway",
    "gate-session",
    "progress-actions",
    // Classes this branch introduced. A style with no element is as dead
    // as an element with no style, and these are new on both sides.
    "hosted-flavour-badge",
    "hosted-boot-blocked",
    "mcq-jump-position",
    "navbar",
    "navbar-home",
    "navbar-wordmark",
    "navbar-back",
    "navbar-crumb-here",
    "nav-menu-bars",
    "nav-menu-scrim",
    "nav-menu-panel-sheet",
    "nav-menu-section",
    "navigator-sheet",
    "navigator-scrim",
    "sheet-grip",
    "confirm-overlay-sheet",
    "confirm-dialog-sheet",
  ];

  test("every class the touch rules restyle is really put on an element", async () => {
    const used = await usedClassNames();
    const dead = targeted.filter((name) => !used.has(name));
    expect(dead, "these touch rules match nothing and do nothing on a phone").toEqual([]);
  });

  test("and the rules that name them are still in the stylesheet", async () => {
    const css = await readThemeCss();
    for (const name of targeted) {
      expect(css, `.${name} lost its touch rule`).toContain(`.${name}`);
    }
  });

  // Pinch-to-zoom is WCAG 1.4.4 and is not ours to disable. The value
  // that opts out of double-tap zoom is `manipulation`; `none` would
  // take the pinch with it, and the two differ by one word.
  //
  // `.panel-resizer` is the one legitimate `none` in the file: it is a
  // drag handle, and without it the browser claims the gesture for
  // scrolling and the pointermove stream stops after a few events. It is
  // 6px wide and suppressed below 900px, so it is not a surface anyone
  // pinches. Any OTHER rule reaching for `none` is the mistake this
  // guards.
  test("double-tap zoom is opted out of, and pinch zoom is not", async () => {
    const css = await readThemeCss();
    expect(css).toContain("touch-action: manipulation");

    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const owners = [...withoutComments.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /touch-action:\s*none/.test(body))
      .map(([, selector]) => selector.replace(/\s+/g, " ").trim());

    expect(owners, "touch-action: none disables pinch zoom on whatever it names").toEqual([
      ".panel-resizer",
    ]);
  });
});
