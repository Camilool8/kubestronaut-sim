import { describe, expect, test } from "vitest";
import { readBaseCss, readThemeCss, ruleBody } from "../test/readCss";

const SELECTED = [
  '.navigator-tile[aria-current="true"]',
  ".navigator-swatch-current",
  ".mcq-option-on, .mcq-option-on:hover",
];

const RING = "box-shadow: inset 0 0 0 1px var(--accent)";

describe("selected tiles share one full accent ring", () => {
  test.each(SELECTED)("%s draws the ring all round, over the soft accent tint", async (selector) => {
    const body = ruleBody(await readThemeCss(), selector);
    expect(body, `${selector} was renamed or removed`).not.toBeNull();
    expect(body).toContain(RING);
    expect(body).toContain("border-color: var(--accent)");
    expect(body).toContain("background: var(--accent-soft)");
  });

  test("no rule paints a one-sided inset stripe", async () => {
    const css = await readThemeCss();
    const stripes = [...css.matchAll(/inset\s+-?\d+(?:\.\d+)?px\s+0\s+0[\s;]/g)].map((m) => m[0]);
    expect(stripes, "a side stripe reads as a tab, not a selection; use the full ring").toEqual([]);
  });

  test("forced colours keep every selected state visible once box-shadow is dropped", async () => {
    const css = await readBaseCss();
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css);
    expect(forced).not.toBeNull();
    for (const selector of ['.navigator-tile[aria-current="true"]', ".navigator-swatch-current", ".mcq-option-on"]) {
      expect(forced![1]).toContain(selector);
    }
    expect(forced![1]).toContain("outline: 2px solid Highlight");
  });
});

describe("the viewed dot survives forced colours", () => {
  test("its fill is a system colour the forced palette keeps", async () => {
    const css = await readBaseCss();
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(forced).toContain(".navigator-tile.is-viewed::after");
    expect(forced).toContain(".navigator-swatch-viewed::after");
    expect(forced).toContain("background: CanvasText");
  });
});
