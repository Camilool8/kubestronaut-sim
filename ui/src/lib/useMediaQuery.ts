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

/*
 * TOUCH_ONLY_QUERY lives in lib/deviceCapability.ts, not here. Every
 * request carries the answer to it as a header, so the module that owns
 * it must be importable by api.ts — which has no business pulling in a
 * hook, and therefore React, to ask what kind of pointer it is talking
 * to.
 */

/**
 * The two-pane split is live, so the panel edge is a real boundary that
 * can be dragged.
 *
 * Written as the exact complement of theme.css's `@media (max-width:
 * 900px)` block, where the question panel leaves the flow and becomes an
 * overlay drawer — a splitter there would be resizing something that is
 * no longer beside anything. `not (max-width: …)` rather than
 * `(min-width: 901px)` because the latter leaves a 1px hole at 900.5 on
 * fractional-DPI displays, where neither rule would apply.
 */
export const SPLIT_QUERY = "not (max-width: 900px)";

/**
 * A phone-sized column: the exam's chrome has to collapse rather than
 * wrap.
 *
 * At its fullest the exam topbar is a title, a three-number tally, a
 * training score button, an About button, a theme toggle, a mode chip, a
 * clock and a submit button. It wraps rather than compressing, which on
 * a 390px screen is three or four rows of chrome — well over a fifth of
 * the viewport — sitting above the question the candidate is trying to
 * read.
 *
 * Mirrored in theme.css's `max-width: 640px` blocks, which is also where
 * the reading type steps up. The two must agree: the JS decides which
 * controls exist, and the CSS sizes what is left.
 */
export const MCQ_COMPACT_QUERY = "(max-width: 640px)";

/**
 * Too narrow for the header's full row.
 *
 * At its fullest that row is a wordmark, a rule, a crumb, a detail line,
 * two nav links, a login, a lease countdown and four buttons. It starts
 * colliding well above the 560px the old rule used, which only ever hid
 * the crumb and let the rest overflow.
 *
 * Mirrored in theme.css's compact-header media query on .app-header —
 * the two breakpoints must agree.
 */
export const HEADER_COMPACT_QUERY = "(max-width: 48rem)";
