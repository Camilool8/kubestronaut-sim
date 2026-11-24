import { useEffect } from "react";
import { strings } from "../strings";

export function tabTitle(...parts: (string | null | undefined)[]): string {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(" · ") : strings.titles.app;
}

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title !== null && document.title !== title) document.title = title;
  }, [title]);
}
