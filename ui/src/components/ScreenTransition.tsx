import { useEffect, useState, type ReactNode } from "react";

// Crossfades between lobby / exam / score. Keyed on session.state, which is
// the only thing that changes the visible screen — there is no router.
//
// The reset-on-key-change happens during render (the documented "adjust
// state while rendering" pattern), not as an effect's first statement:
// this repo's react-hooks/set-state-in-effect rule flags a synchronous
// setState at the top of an effect, and every existing case of that
// warning here is pre-existing debt, not something to add to. The effect
// below only ever calls setState from inside the deferred rAF callback.
export function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  const [key, setKey] = useState(screenKey);
  const [entered, setEntered] = useState(false);

  if (screenKey !== key) {
    setKey(screenKey);
    setEntered(false);
  }

  useEffect(() => {
    if (entered) return;
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [entered]);

  return <div className={`screen${entered ? " screen-entered" : ""}`}>{children}</div>;
}
