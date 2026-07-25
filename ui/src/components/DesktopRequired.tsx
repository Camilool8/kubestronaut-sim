import { useState } from "react";
import { useMediaQuery, NARROW_QUERY, TOUCH_ONLY_QUERY } from "../lib/useMediaQuery";
import { strings } from "../strings";

const OVERRIDE_KEY = "sim.desktopGateOverride";

export type GateVerdict =
  /** Phone or tablet: the exam genuinely cannot work here. */
  | "blocked"
  /** A desktop with a small window — offer a way through. */
  | "narrow"
  | "ok";

/**
 * Decides whether the exam screen can be shown.
 *
 * The distinction matters: a touch-only device has no keyboard for a
 * terminal and no room for a desktop beside the questions, so there is
 * nothing useful to let through. A desktop user who merely shrank their
 * window — or zoomed to 400%, which reports the same width — is having
 * a layout problem, not a capability problem, and blocking them outright
 * would be a bug.
 */
export function useDesktopGate(): GateVerdict {
  const narrow = useMediaQuery(NARROW_QUERY);
  const touchOnly = useMediaQuery(TOUCH_ONLY_QUERY);
  if (!narrow) return "ok";
  return touchOnly ? "blocked" : "narrow";
}

export function gateOverridden(): boolean {
  return localStorage.getItem(OVERRIDE_KEY) === "1";
}

interface DesktopRequiredProps {
  verdict: GateVerdict;
  /** Rendered underneath the explanation while a session is running. */
  children?: React.ReactNode;
}

/**
 * The screen a phone gets instead of a broken exam layout. It is the
 * page's real content, not an overlay over a hidden app, and it has to
 * work at 320 CSS px — it is the one screen these users will ever see.
 */
export function DesktopRequired({ verdict, children }: DesktopRequiredProps) {
  const [, force] = useState(0);

  const continueAnyway = () => {
    localStorage.setItem(OVERRIDE_KEY, "1");
    force((n) => n + 1);
  };

  return (
    <div className="desktop-required">
      <div className="desktop-required-card">
        <h1>{strings.mobile.title}</h1>
        <p>{strings.mobile.why}</p>
        <ul className="desktop-required-needs">
          {strings.mobile.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="desktop-required-still">{strings.mobile.stillAvailable}</p>
        {children}
        {verdict === "narrow" && (
          <button className="btn" onClick={continueAnyway}>
            {strings.mobile.continueAnyway}
          </button>
        )}
      </div>
    </div>
  );
}
