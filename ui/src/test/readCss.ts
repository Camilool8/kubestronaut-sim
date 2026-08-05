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
 * Every class name any component actually puts on an element.
 *
 * Collected from `className=` attributes, the template literals that
 * build a conditional one (`mcq-option${on ? " mcq-option-on" : ""}`),
 * and `classList` calls. Deliberately over-inclusive: this exists so a
 * test can prove a SELECTOR is not dead, and a false "yes it is used"
 * from some unrelated string is a missed catch, while a false "no" would
 * be a failing build over nothing.
 */
export async function usedClassNames(): Promise<Set<string>> {
  const fsMod = (await import("node:" + "fs")) as {
    readFileSync: (path: string, encoding: string) => string;
    readdirSync: (path: string, opts: { withFileTypes: true }) => {
      name: string;
      isDirectory: () => boolean;
    }[];
  };
  const urlMod = (await import("node:" + "url")) as {
    fileURLToPath: (url: string) => string;
  };
  const pathMod = (await import("node:" + "path")) as {
    default: { join: (...segments: string[]) => string; dirname: (p: string) => string };
  };
  const nodePath = pathMod.default;
  const src = nodePath.join(nodePath.dirname(urlMod.fileURLToPath(import.meta.url)), "..");

  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fsMod.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) continue;
      if (entry.name.includes(".test.")) continue;
      const source = fsMod.readFileSync(full, "utf8");
      // Any run of class-shaped characters inside a quoted or
      // backticked string. Cheaper and more robust than parsing JSX,
      // and the over-inclusiveness is the documented trade above.
      for (const match of source.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
        for (const token of match[1].split(/[\s${}]+/)) {
          if (/^[a-z][a-z0-9-]*$/.test(token)) names.add(token);
        }
      }
    }
  };
  walk(src);
  return names;
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
