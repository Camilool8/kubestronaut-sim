import { strings } from "../strings";

/** Scripts written right to left; the question and solution panes set `dir` for them. */
const RTL = new Set(["ar", "he", "fa", "ur"]);

export function isRtl(lang: string | undefined): boolean {
  if (!lang) return false;
  return RTL.has(lang.split("-")[0].toLowerCase());
}

/** The language's own name, or the code when the table has no entry. */
export function languageName(code: string): string {
  return strings.mode.languageNames[code] ?? strings.mode.languageNames[code.split("-")[0]] ?? code;
}

/** Attributes a markdown pane takes so a translation reads in its own script and direction. */
export function textDirection(lang: string | undefined): { lang?: string; dir?: "rtl" } {
  if (!lang) return {};
  return isRtl(lang) ? { lang, dir: "rtl" } : { lang };
}
