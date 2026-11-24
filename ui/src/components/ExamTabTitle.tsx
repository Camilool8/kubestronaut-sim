import type { SessionSnapshot } from "../api";
import { formatClock } from "../lib/format";
import { tabTitle, useDocumentTitle } from "../lib/useDocumentTitle";
import { useExamClock } from "../lib/useExamClock";
import { strings } from "../strings";

export function ExamTabTitle({
  session,
  fetchedAt,
  label,
}: {
  session: SessionSnapshot;
  fetchedAt: number;
  label: string;
}) {
  const { remaining, untimed } = useExamClock(session, fetchedAt);
  useDocumentTitle(
    tabTitle(untimed ? strings.titles.training : formatClock(remaining), label || strings.titles.app),
  );
  return null;
}
