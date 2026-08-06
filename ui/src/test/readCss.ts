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

export function readThemeCss(): Promise<string> {
  return readSrcFile("theme.css");
}

export function readBaseCss(): Promise<string> {
  return readSrcFile("styles", "base.css");
}

export function readTokensCss(): Promise<string> {
  return readSrcFile("styles", "tokens.css");
}

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

      for (const token of source.split(/[^a-zA-Z0-9-]+/)) {
        if (/^[a-z][a-z0-9-]*$/.test(token)) names.add(token);
      }
    }
  };
  walk(src);
  return names;
}

export function ruleBody(css: string, selector: string): string | null {
  const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (normalise(match[1]) === normalise(selector)) return normalise(match[2]);
  }
  return null;
}
