// Reads a stylesheet off disk so a test can assert on declarations jsdom
// cannot evaluate. jsdom has no CSS engine: `getComputedStyle` returns the
// inline/default value for anything that came from a <link> or an import,
// so a rule that only exists in a .css file is invisible to a render test.
// For a handful of declarations — the ones that are load-bearing rather
// than cosmetic — reading the source text is the only automated check
// available short of a real browser.
//
// This project has no @types/node, and adding one would touch package.json
// and the lockfile. Node still provides fs/path/url at runtime regardless
// (these tests run under vitest, i.e. Node, not a browser); the only
// obstacle is `tsc`, which resolves a dynamic `import()` against installed
// types solely when its argument is a string *literal*. Building the
// specifier by concatenation keeps its static type as `string` rather than
// a literal, so tsc skips resolution and types the result `any` instead of
// erroring — no new .d.ts, no new dependency.
//
// Every caller shares this one copy of the trick. See docs/follow-ups.md:
// replace the whole file with a plain `node:fs` import if @types/node ever
// enters the project.

/** Reads a file resolved relative to `ui/src/`. */
export async function readSrcFile(...segments: string[]): Promise<string> {
  const fsMod = (await import("node:" + "fs")) as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const urlMod = (await import("node:" + "url")) as {
    fileURLToPath: (url: string) => string;
  };
  const pathMod = (await import("node:" + "path")) as {
    default: { join: (...segments: string[]) => string; dirname: (p: string) => string };
  };
  const nodePath = pathMod.default;
  const here = nodePath.dirname(urlMod.fileURLToPath(import.meta.url));
  return fsMod.readFileSync(nodePath.join(here, "..", ...segments), "utf8");
}

/** The component stylesheet (`ui/src/theme.css`). */
export function readThemeCss(): Promise<string> {
  return readSrcFile("theme.css");
}

/** The element-defaults layer (`ui/src/styles/base.css`). */
export function readBaseCss(): Promise<string> {
  return readSrcFile("styles", "base.css");
}

/** The design tokens (`ui/src/styles/tokens.css`). */
export function readTokensCss(): Promise<string> {
  return readSrcFile("styles", "tokens.css");
}

/**
 * Returns the declaration block of the first rule whose selector list
 * matches `selector` exactly (after whitespace normalisation), or null.
 *
 * Deliberately naive: flat rules only, and CSS comments are stripped
 * first, because a comment block sitting above a rule otherwise lands
 * inside the selector capture. Good enough to assert that a specific
 * declaration survives; not a CSS parser.
 */
export function ruleBody(css: string, selector: string): string | null {
  const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (normalise(match[1]) === normalise(selector)) return normalise(match[2]);
  }
  return null;
}
