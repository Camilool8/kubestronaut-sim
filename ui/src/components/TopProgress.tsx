import { useSyncExternalStore } from "react";
import { progressStore } from "./progressStore";
import { strings } from "../strings";

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
