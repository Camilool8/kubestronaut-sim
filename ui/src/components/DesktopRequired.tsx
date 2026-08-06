import { useState } from "react";
import { useMediaQuery, NARROW_QUERY } from "../lib/useMediaQuery";
import { TOUCH_ONLY_QUERY } from "../lib/deviceCapability";
import { strings } from "../strings";

const OVERRIDE_KEY = "sim.desktopGateOverride";

export type GateVerdict =

  | "blocked"

  | "narrow"
  | "ok";

export function useDesktopGate(): GateVerdict {
  const narrow = useMediaQuery(NARROW_QUERY);
  const touchOnly = useMediaQuery(TOUCH_ONLY_QUERY);
  if (touchOnly) return "blocked";
  return narrow ? "narrow" : "ok";
}

export function gateOverridden(): boolean {
  return localStorage.getItem(OVERRIDE_KEY) === "1";
}

interface DesktopRequiredProps {
  verdict: GateVerdict;

  children?: React.ReactNode;
}

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
        {children}
        <p>{strings.mobile.why}</p>
        <ul className="desktop-required-needs">
          {strings.mobile.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        {!children && <p className="desktop-required-still">{strings.mobile.stillAvailable}</p>}

        {verdict === "narrow" && (
          <button className="btn desktop-required-anyway" onClick={continueAnyway}>
            {strings.mobile.continueAnyway}
          </button>
        )}
      </div>
    </div>
  );
}
