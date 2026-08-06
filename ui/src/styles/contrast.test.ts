import { describe, expect, it } from "vitest";
import { readTokensCss } from "../test/readCss";

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

type Tokens = Record<string, string>;

function collect(css: string, matches: (selector: string) => boolean): Tokens {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Tokens = {};
  for (const rule of withoutComments.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!matches(rule[1].replace(/\s+/g, " ").trim())) continue;
    for (const decl of rule[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[decl[1]] = decl[2].trim();
    }
  }
  return out;
}

const css = await readTokensCss();
const root = collect(css, (s) => s === ":root");
const darkBlock = collect(css, (s) => s === ':root[data-theme="dark"]');
const mediaBlock = collect(css, (s) => s.startsWith(":root:not("));

const light: Tokens = { ...root };
const dark: Tokens = { ...root, ...darkBlock };

const FILLS = ["bg", "surface", "surface-raised", "surface-hover", "raised-hover"];

function worst(t: Tokens, token: string, fills: string[]) {
  expect(t[token], `--${token} is not declared`).toBeTruthy();
  let low = { fill: "", ratio: Infinity };
  for (const fill of fills) {
    if (!t[fill]) continue;
    const ratio = contrast(t[token], t[fill]);
    if (ratio < low.ratio) low = { fill, ratio };
  }
  return low;
}

const TEXT_4_5: Record<string, string[]> = {
  text: [],
  "text-body": [],
  "text-secondary": [],
  "text-muted": [],
  "text-subtle": ["neutral-soft"],
  accent: ["accent-soft"],
  "accent-strong": ["accent-soft"],
  "progress-strong": ["progress-soft"],
  "success-strong": ["success-soft"],
  danger: ["danger-soft", "danger-row"],
  "warn-strong": ["warn-soft"],
};

const GRAPHIC_3: Record<string, string[]> = {
  "border-strong": ["accent-soft"],
  success: ["success-soft"],
  warn: ["warn-soft"],
};

const BAR_FILLS = ["bg", "surface", "surface-raised", "neutral-soft"];

const ON_INK: Record<string, number> = {
  "ink-text": 4.5,
  "ink-muted": 4.5,
  "ink-faint": 4.5,
  "ink-accent": 4.5,
  "warn-marker": 3,
};

const TINTS: [string, string][] = [
  ["practical", ":root"],
  ["mcq", '[data-engine="mcq"]'],
  ["coming soon", '[data-engine="soon"]'],
];

function dealias(value: string): string {
  return value.replace(/^var\(\s*--([a-z0-9-]+)\s*\)$/, "$1");
}

const MACHINE_FILLS = ["machine-bg", "machine-surface", "machine-raised"];
const ON_MACHINE = [
  "machine-text",
  "machine-muted",
  "machine-faint",
  "machine-green",
  "machine-green-soft",
  "machine-blue",
  "machine-amber",
  "diff-add-fg",
  "diff-del-fg",
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_theme, t) => {
  it.each(Object.entries(TEXT_4_5))("--%s reads as text (4.5:1)", (token, extra) => {
    const { fill, ratio } = worst(t, token, [...FILLS, ...extra]);
    expect(ratio, `--${token} is ${ratio.toFixed(2)}:1 on --${fill}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(GRAPHIC_3))("--%s reads as a graphic (3:1)", (token, extra) => {
    const { fill, ratio } = worst(t, token, [...FILLS, ...extra]);
    expect(ratio, `--${token} is ${ratio.toFixed(2)}:1 on --${fill}`).toBeGreaterThanOrEqual(3);
  });

  it("--progress clears 3:1 on the tracks it fills", () => {
    const { fill, ratio } = worst(t, "progress", BAR_FILLS);
    expect(ratio, `--progress is ${ratio.toFixed(2)}:1 on --${fill}`).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(ON_INK))("--%s reads on --ink", (token, floor) => {
    const ratio = contrast(t[token], t.ink);
    expect(ratio, `--${token} is ${ratio.toFixed(2)}:1 on --ink`).toBeGreaterThanOrEqual(floor);
  });

  it("--accent-contrast reads on the primary button", () => {
    expect(contrast(t["accent-contrast"], t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["syntax-string", "syntax-number"])("--%s reads in a code block", (token) => {
    const ratio = contrast(t[token], t["surface-raised"]);
    expect(ratio, `--${token} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ON_MACHINE)("--%s reads on every machine surface", (token) => {
    const { fill, ratio } = worst(t, token, MACHINE_FILLS);
    expect(ratio, `--${token} is ${ratio.toFixed(2)}:1 on --${fill}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the two border tiers stay far enough apart to read as two", () => {
    expect(contrast(t.border, t["border-strong"])).toBeGreaterThan(1.5);
  });

  it.each(TINTS)("the %s exam tint reads as text on its own fill", (_name, selector) => {
    const rule = collect(css, (s) => s === selector);
    const fg = dealias(rule["exam-tint"] ?? "");
    const bg = dealias(rule["exam-tint-soft"] ?? "");
    expect(t[fg], `--exam-tint aliases --${fg}, which is not a declared colour`).toBeTruthy();
    expect(t[bg], `--exam-tint-soft aliases --${bg}, which is not a declared colour`).toBeTruthy();

    const ratio = contrast(t[fg], t[bg]);
    expect(
      ratio,
      `--${fg} is ${ratio.toFixed(2)}:1 on --${bg}`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("theme structure", () => {
  it("the media-query twin matches the explicit dark block exactly", () => {
    const explicit = Object.keys(darkBlock).sort();
    expect(Object.keys(mediaBlock).sort()).toEqual(explicit);
    for (const token of explicit) {
      expect(mediaBlock[token], `--${token} differs between the two dark blocks`).toBe(
        darkBlock[token],
      );
    }
  });

  it("every colour token declared in light has a dark value", () => {
    const isColour = (v: string) => /^(#|rgba?\()/.test(v);
    const missing = Object.entries(root)
      .filter(([token, value]) => isColour(value) && !(token in darkBlock))
      .map(([token]) => token)

      .filter((token) => !token.startsWith("machine-") && !token.startsWith("diff-"));
    expect(missing).toEqual([]);
  });

  it("the machine family is defined once and never re-themed", () => {
    for (const token of Object.keys(root).filter((k) => k.startsWith("machine-"))) {
      expect(darkBlock[token], `--${token} must not be re-declared in dark`).toBeUndefined();
    }
  });
});
