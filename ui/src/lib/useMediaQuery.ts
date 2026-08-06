import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export const NARROW_QUERY = "(max-width: 767px)";

export const SPLIT_QUERY = "not (max-width: 900px)";

export const MCQ_COMPACT_QUERY = "(max-width: 640px)";

export const HEADER_COMPACT_QUERY = "(max-width: 48rem)";
