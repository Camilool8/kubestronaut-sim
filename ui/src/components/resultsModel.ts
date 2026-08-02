// The arithmetic the results screen does before it draws anything.
//
// It lives outside the components because three surfaces read the same
// numbers — the banner's prose names the weak domains, the sidebar lists
// every domain, and the verdicts table labels each row — and three copies
// of this would be three chances to disagree with each other on one
// screen.
//
// Everything here is written against a result whose newer fields may be
// missing. That is not defensive padding: a result graded before a field
// existed is persisted verbatim as opaque bytes in the session file and
// served back unchanged after an upgrade, so an old result genuinely
// arrives with no `domains`, no `verdict` and no timings.

import type { DomainResult, QuestionResult, Verdict } from "../api";
import { formatClock } from "../lib/format";
import { strings } from "../strings";

export type { Verdict };

export interface DomainRow {
  domain: string;
  earned: number;
  total: number;
  percent: number;
  questionCount: number;
  /** Percentage points of the whole exam. Only the server can know it. */
  weightPct?: number;
}

/**
 * The per-domain rollup, worst-first — the server's when it sent one, and
 * the same shape recomputed from the questions when it did not.
 *
 * Worst-first is deliberate. Alphabetical would bury the one row that
 * should change what the candidate does next.
 */
export function rollupDomains(
  questions: QuestionResult[],
  domains?: DomainResult[],
): DomainRow[] {
  return domains !== undefined && domains.length > 0
    ? sort(
        domains.map((d) => ({
          domain: d.domain || strings.score.domainUnknown,
          earned: d.earned,
          total: d.total,
          percent: percentOf(d.earned, d.total),
          questionCount: d.questionCount,
          weightPct: d.weightPct,
        })),
      )
    : sort(fromQuestions(questions));
}

function fromQuestions(questions: QuestionResult[]): DomainRow[] {
  const byDomain = new Map<string, DomainRow>();
  for (const q of questions) {
    const domain = q.domain || strings.score.domainUnknown;
    const row =
      byDomain.get(domain) ?? { domain, earned: 0, total: 0, percent: 0, questionCount: 0 };
    row.earned += q.earned;
    row.total += q.total;
    row.questionCount += 1;
    byDomain.set(domain, row);
  }
  return [...byDomain.values()].map((r) => ({ ...r, percent: percentOf(r.earned, r.total) }));
}

function percentOf(earned: number, total: number): number {
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

function sort(rows: DomainRow[]): DomainRow[] {
  return rows.sort((a, b) => a.percent - b.percent || a.domain.localeCompare(b.domain));
}

/**
 * A question's verdict, with the grader's own rule as the fallback for a
 * result persisted before `verdict` existed.
 *
 * This mirrors facilitator/internal/evaluate/evaluate.go:402 exactly,
 * including the part that looks like a bug and is not: a question with no
 * scorable points at all reads as failed rather than as a free "correct",
 * because a score must never round in the candidate's favour by accident.
 */
export function verdictOf(
  verdict: string | undefined,
  earned: number,
  total: number,
): Verdict {
  if (verdict === "correct" || verdict === "partial" || verdict === "failed") return verdict;
  if (total > 0 && earned >= total) return "correct";
  if (earned > 0) return "partial";
  return "failed";
}

/**
 * A span as m:ss, or h:mm:ss once it needs the hour.
 *
 * formatClock always prints the hour, which turns a 43-minute attempt
 * into "0:43:12" — a leading zero the banner's stat block reads as a
 * missing digit rather than as an absent hour.
 */
export function formatSpan(seconds: number): string {
  return formatClock(seconds).replace(/^0:/, "");
}
