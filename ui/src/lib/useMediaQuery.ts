import { useCallback, useSyncExternalStore } from "react";

// Small dependency-free matchMedia hook. matchMedia is already an
// external store with a subscribe/read shape, so useSyncExternalStore
// reads it directly (the same pattern components/Toast uses for the
// toast store) rather than mirroring it into state. Subscribing means
// rotating a phone or resizing a window re-evaluates, instead of
// freezing whatever happened to be true at mount.
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

/**
 * Small enough that the exam's split-screen (question panel beside a
 * full Linux desktop) cannot work.
 */
export const NARROW_QUERY = "(max-width: 767px)";

/**
 * No precise pointer available anywhere — a phone or tablet, as opposed
 * to a touchscreen laptop, which reports both.
 *
 * `any-pointer` rather than `pointer` is deliberate: `pointer` reports
 * only the *primary* input, so a touchscreen laptop would look like a
 * phone. And the check for the absence of `fine` is what keeps a
 * low-vision desktop user out of the gate — WCAG 1.4.10 defines 320 CSS
 * px as equivalent to a 1280px window at 400% zoom, so a width-only
 * test would lock out exactly the people who most need the zoom.
 */
export const TOUCH_ONLY_QUERY = "(any-pointer: coarse) and (not (any-pointer: fine))";
