import type { CatalogExam } from "../api";

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

export function formatAttemptDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

export type PathStatus = "passed" | "attempted" | "untouched" | "soon";

export function pathStatus(exam: CatalogExam): PathStatus {
  if (!exam.available) return "soon";
  if (exam.progress.passed) return "passed";
  return exam.progress.attempts > 0 ? "attempted" : "untouched";
}

export const DRILL_DOMAIN_PARAM = "domain";

export function drillHref(bankId: string, domains: string[]): string {
  const params = new URLSearchParams();
  for (const name of domains) params.append(DRILL_DOMAIN_PARAM, name);
  return `/exams/${encodeURIComponent(bankId)}/mode?${params.toString()}`;
}

export function parseDomainsParam(query: URLSearchParams): string[] {
  return query
    .getAll(DRILL_DOMAIN_PARAM)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}
