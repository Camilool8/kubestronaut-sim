import type { ReactNode } from "react";

// Crossfades between lobby / exam / score. Keyed on session.state, which is
// the only thing that changes the visible screen — there is no router.
//
// `.screen` carries no resting opacity/transform of its own: the fade-in
// lives entirely in a `@media (prefers-reduced-motion: no-preference)`
// keyframe animation in theme.css (the same from-only-keyframe-plus-
// fill-mode-both pattern as scrim-in/dialog-in/toast-in/row-in), so the
// element's default, unanimated state is fully visible. That is the
// point: visibility must never depend on JavaScript running. An earlier
// version toggled a `.screen-entered` class from inside a
// requestAnimationFrame callback, which made the RESTING state
// `opacity: 0` and left the screen invisible whenever a hidden/
// backgrounded tab throttled or suspended that rAF before it fired.
//
// `key={screenKey}` forces React to unmount and remount this div (and
// the screen inside it) on every screen change, which is what replays
// the CSS entrance animation — no JS state, no effect, nothing that can
// fail to run.
export function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  return (
    <div key={screenKey} className="screen">
      {children}
    </div>
  );
}
