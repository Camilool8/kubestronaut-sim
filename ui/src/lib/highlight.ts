const SUPPORTED = new Set(["yaml", "bash", "sh", "shell", "json"]);

let enginePromise: Promise<typeof import("highlight.js/lib/core").default> | null = null;

async function engine() {
  if (!enginePromise) {
    const loading = (async () => {
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

    enginePromise = loading.catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

export async function highlightTo(language: string, code: string): Promise<string | null> {
  if (!SUPPORTED.has(language)) return null;
  try {
    const hljs = await engine();
    return hljs.highlight(code, { language }).value;
  } catch {
    return null;
  }
}
