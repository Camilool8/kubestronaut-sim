import { describe, expect, it } from "vitest";
import { readSrcFile, readTokensCss } from "../test/readCss";

const REPO = ["..", ".."];

function tokensFrom(css: string, selector: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const rule of withoutComments.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (rule[1].replace(/\s+/g, " ").trim() !== selector) continue;
    for (const decl of rule[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[decl[1]] = decl[2].trim();
    }
  }
  return out;
}

const css = await readTokensCss();
const light = tokensFrom(css, ":root");
const dark = tokensFrom(css, ':root[data-theme="dark"]');

describe("mirror: the exam terminal palette", () => {
  const expected: Record<string, string> = {
    ColorForeground: light["machine-text"],
    ColorBackground: light["machine-bg"],
    ColorCursor: light["machine-blue"],
  };

  it.each(Object.entries(expected))("terminalrc %s tracks tokens.css", async (key, value) => {
    const rc = await readSrcFile(...REPO, "images", "desktop", "assets", "terminalrc");
    expect(rc).toContain(`${key}=${value}`);
  });

  it("the xfconf twin declares the same foreground, background and cursor", async () => {
    const xml = await readSrcFile(
      ...REPO, "images", "desktop", "assets", "xfconf", "xfce4-terminal.xml",
    );
    for (const [rcKey, value] of Object.entries(expected)) {
      const prop = rcKey.replace("Color", "color-").toLowerCase();
      expect(xml, `${prop} should be ${value}`).toContain(
        `name="${prop}" type="string" value="${value}"`,
      );
    }
  });

  it("the xfconf twin declares the same 16-colour palette as terminalrc", async () => {
    const rc = await readSrcFile(...REPO, "images", "desktop", "assets", "terminalrc");
    const xml = await readSrcFile(
      ...REPO, "images", "desktop", "assets", "xfconf", "xfce4-terminal.xml",
    );
    const fromRc = /^ColorPalette=(.+)$/m.exec(rc)?.[1];
    const fromXml = /name="color-palette" type="string" value="([^"]+)"/.exec(xml)?.[1];
    expect(fromRc, "terminalrc declares no ColorPalette").toBeTruthy();
    expect(fromXml, "the xfconf twin declares no color-palette").toBeTruthy();
    expect(fromXml).toBe(fromRc);
    expect(fromRc?.split(";")).toHaveLength(16);
  });

  it("the terminal's green and amber are the dark syntax colours", async () => {
    const rc = await readSrcFile(...REPO, "images", "desktop", "assets", "terminalrc");
    const palette = /^ColorPalette=(.+)$/m.exec(rc)?.[1].split(";") ?? [];
    expect(palette[2]).toBe(dark["syntax-string"]);
    expect(palette[3]).toBe(dark["syntax-number"]);
    expect(palette[2]).toBe(light["machine-green"]);
    expect(palette[3]).toBe(light["machine-amber"]);
  });
});

describe("mirror: the Go locked-desktop page", () => {
  const subset = ["bg", "surface", "border", "text", "text-muted"];

  it.each(subset)("light --%s matches tokens.css", async (token) => {
    const go = await readSrcFile(...REPO, "facilitator", "internal", "desktop", "proxy.go");
    expect(go).toContain(`--${token}: ${light[token]};`);
  });

  it.each(subset)("dark --%s matches tokens.css, in both dark blocks", async (token) => {
    const go = await readSrcFile(...REPO, "facilitator", "internal", "desktop", "proxy.go");
    const hits = go.split(`--${token}: ${dark[token]};`).length - 1;

    expect(hits, `expected 2 occurrences of --${token}: ${dark[token]}`).toBe(2);
  });
});

describe("mirror: the favicon", () => {
  it("is drawn from the ink and machine tokens", async () => {
    const svg = await readSrcFile("..", "public", "favicon.svg");
    for (const token of ["ink", "machine-blue", "machine-green-soft", "machine-amber"]) {
      expect(svg, `favicon should use --${token} (${light[token]})`).toContain(light[token]);
    }
  });

  it("is well-formed XML, not just the right colours", async () => {
    const svg = await readSrcFile("..", "public", "favicon.svg");
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const error = doc.querySelector("parsererror");
    expect(error?.textContent ?? "").toBe("");
    expect(doc.documentElement.tagName).toBe("svg");
  });
});
