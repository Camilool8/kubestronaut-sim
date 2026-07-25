// Syntax highlighting for the three languages bank content actually uses.
//
// Registering the full highlight.js language pack would add far more to the
// bundle than the exam needs — docs/follow-ups.md already flags the ~470KB
// baseline. The core plus three grammars is loaded on demand, so the lobby
// never pays for it and a candidate who opens no code block never downloads
// it.

const SUPPORTED = new Set(["yaml", "bash", "sh", "shell", "json"]);

let enginePromise: Promise<typeof import("highlight.js/lib/core").default> | null = null;

async function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [{ default: hljs }, yaml, bash, json] = await Promise.all([
        import("highlight.js/lib/core"),
        import("highlight.js/lib/languages/yaml"),
        import("highlight.js/lib/languages/bash"),
        import("highlight.js/lib/languages/json"),
      ]);
      hljs.registerLanguage("yaml", yaml.default);
      hljs.registerLanguage("bash", bash.default);
      hljs.registerLanguage("json", json.default);
      hljs.registerAliases(["sh", "shell"], { languageName: "bash" });
      return hljs;
    })();
  }
  return enginePromise;
}

/** Returns highlighted HTML, or null when the language is out of scope. */
export async function highlightTo(language: string, code: string): Promise<string | null> {
  if (!SUPPORTED.has(language)) return null;
  try {
    const hljs = await engine();
    return hljs.highlight(code, { language }).value;
  } catch {
    // A grammar that failed to load must never cost the user the listing.
    return null;
  }
}
