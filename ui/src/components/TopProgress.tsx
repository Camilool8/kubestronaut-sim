import { useSyncExternalStore } from "react";
import { progressStore } from "./progressStore";
import { strings } from "../strings";

// A single indeterminate bar pinned to the top of the viewport. Determinate
// would need historical phase durations, which is a follow-up — see
// docs/follow-ups.md.
export function TopProgress() {
  const visible = useSyncExternalStore(progressStore.subscribe, progressStore.isVisible);
  if (!visible) return null;
  return (
    <div className="top-progress" role="status">
      <span className="sr-only">{strings.app.working}</span>
      <div className="top-progress-track">
        <div className="top-progress-bar" />
      </div>
    </div>
  );
}
