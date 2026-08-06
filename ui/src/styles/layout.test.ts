import { describe, expect, test } from "vitest";
import { readBaseCss, readThemeCss, ruleBody, usedClassNames } from "../test/readCss";

describe("full-height chain", () => {
  test("the chain reaches #root, or every screen root's percentage collapses", async () => {
    const css = await readBaseCss();
    const body = ruleBody(css, "html, body, #root");

    expect(body, "the html/body/#root height rule was renamed or removed").not.toBeNull();
    expect(body).toContain("height: 100%");
  });

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
    const css = await readThemeCss();
    expect(ruleBody(css, ".exam-layout")).toContain("height: 100%");

    expect(ruleBody(css, ".score-screen")).toContain("min-height: 100%");
    expect(ruleBody(css, ".score-screen")).not.toContain("overflow-y: auto");

    expect(ruleBody(css, ".page")).toContain("min-height: 100%");
    expect(ruleBody(css, ".page")).not.toContain("overflow-y: auto");
  });

  test("the score screen's wrapper is allowed to grow with it", async () => {
    const css = await readThemeCss();
    const body = ruleBody(css, ".screen:has(> .score-screen)");
    expect(body, "the score screen's wrapper override was renamed or removed").not.toBeNull();
    expect(body).toContain("height: auto");
  });
});

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

describe("the explanation deep dive", () => {
  test("the document panes stay on the machine palette", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".explain-pane-body")).toContain("background: var(--machine-bg)");
  });

  test("a highlighted line spans the whole scroll width, not the visible box", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".explain-pane-body code")).toContain("min-width: 100%");
    expect(ruleBody(css, ".explain-line")).toContain("display: block");
  });

  test("the diff gutter is not part of what a candidate copies out", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".explain-line-mark")).toContain("user-select: none");
  });

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

  test("a three-line title cannot squeeze the steppers", async () => {
    const css = await readThemeCss();
    expect(ruleBody(css, ".explain-head")).toContain("flex-wrap: wrap");
    expect(ruleBody(css, ".explain-head")).toContain("align-items: flex-start");
    expect(ruleBody(css, ".explain-nav")).toContain("flex: 0 0 auto");
  });

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

    expect(ruleBody(css, ".explain")).toContain("--explain-measure");

    expect(ruleBody(css, ".explain-solution")).not.toContain("max-width");
  });
});

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

    expect(domain).toContain("min-width: 0");
  });
});

describe("the exam tips sheet", () => {
  test("is wider than a confirm dialog, because it is read rather than answered", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".confirm-dialog-wide"), "the base wide dialog was renamed").toContain(
      "min(560px",
    );
    expect(ruleBody(css, ".confirm-dialog-wide:has(> .tips-body)")).toContain("min(760px");
  });

  test("does not open a second scroll container inside the dialog", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".confirm-dialog")).toContain("overflow-y: auto");
    expect(ruleBody(css, ".tips-body")).not.toContain("overflow");
    expect(ruleBody(css, ".tips-body")).not.toContain("max-height");
  });
});

describe("value chips that are too long for their column", () => {
  test("break anywhere in a panel, but keep the token whole in a table", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".copy-value code")).toContain("overflow-wrap: anywhere");

    expect(ruleBody(css, ".md th code, .md td code")).toContain("overflow-wrap: break-word");
  });
});

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
