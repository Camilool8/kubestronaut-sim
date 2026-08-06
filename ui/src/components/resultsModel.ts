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

  weightPct?: number;
}

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

export function formatSpan(seconds: number): string {
  return formatClock(seconds).replace(/^0:/, "");
}
