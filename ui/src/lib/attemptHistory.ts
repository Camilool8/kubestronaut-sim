// Shared reading of the attempt record, for the three screens that look
// across attempts rather than within one: the progress dashboard, the exam
// catalog's best-attempt bar, and the mode screen's drill deep link.
//
// It holds no copy — every string here is a token the caller looks up in
// `strings.ts`. What it holds is the ARITHMETIC and the two encodings
// (a date, a query parameter) that would otherwise be written three times
// and drift twice.

import type { CatalogExam } from "../api";

// Written out rather than handed to Intl. Two reasons, and only the second
// is about tests: the product speaks one voice in one language, so a date
// that follows the reader's locale would render "3/12/2026" beside copy
// that says "12 Mar" three lines up — and Intl's month names depend on the
// ICU data the runtime happens to carry, which is not something a
// stylesheet-shaped product should be betting a column width on.
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * An RFC3339 timestamp as "12 Mar 2026".
 *
 * LOCAL time, deliberately: the candidate means "the evening I sat it",
 * and the server stores an instant. An unparseable value comes back
 * verbatim rather than as "Invalid Date" — a record persisted by an older
 * facilitator is a normal thing to meet, and showing the raw field at
 * least says which one is odd.
 */
export function formatAttemptDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

/**
 * Which of the four states a certification path card is in.
 *
 * `passed` is the server's, derived from COUNTED attempts only, so a
 * flawless domain drill can never light up a path card — see the comment
 * on `AttemptRecord.counted`. An exam nobody can sit yet is its own state
 * rather than a zeroed "not started": the card must not read as work the
 * candidate has failed to do.
 */
export type PathStatus = "passed" | "attempted" | "untouched" | "soon";

export function pathStatus(exam: CatalogExam): PathStatus {
  if (!exam.available) return "soon";
  if (exam.progress.passed) return "passed";
  return exam.progress.attempts > 0 ? "attempted" : "untouched";
}

/**
 * The query key the drill preselection travels under. Repeated once per
 * domain rather than packed into one comma-joined value: a domain name is
 * free text a bank author writes, and CKAD really does ship one with a
 * comma in it ("Application Environment, Configuration and Security").
 * Packed, that name would arrive as three domains the bank does not have.
 */
export const DRILL_DOMAIN_PARAM = "domain";

/** The mode screen, with these domains preselected. */
export function drillHref(bankId: string, domains: string[]): string {
  const params = new URLSearchParams();
  for (const name of domains) params.append(DRILL_DOMAIN_PARAM, name);
  return `/exams/${encodeURIComponent(bankId)}/mode?${params.toString()}`;
}

/**
 * The inverse, for the mode screen reading its own route.
 *
 * Takes the route's parsed query (`useRoute().query`), which has already
 * done the decoding — URLSearchParams is the same decoder the browser
 * used on the way out, so a name round-trips whatever is in it. Blank
 * entries are dropped; the caller intersects what survives against the
 * loaded bank's own curriculum, so a name from another certification
 * simply falls out rather than producing a draw from nothing.
 */
export function parseDomainsParam(query: URLSearchParams): string[] {
  return query
    .getAll(DRILL_DOMAIN_PARAM)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}
