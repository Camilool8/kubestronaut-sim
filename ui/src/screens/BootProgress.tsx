import { useId } from "react";
import type { BootStatus } from "../api";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { Icon } from "../components/Icon";
import { strings } from "../strings";

interface BootProgressProps {
  boot: BootStatus | null;
  onRetry: () => void | Promise<void>;
}

const PHASES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "dockerd", label: strings.boot.phaseLabels.dockerd },
  { id: "helm-repo", label: strings.boot.phaseLabels["helm-repo"] },
  { id: "create-cluster", label: strings.boot.phaseLabels["create-cluster"] },
  { id: "api-server", label: strings.boot.phaseLabels["api-server"] },
  { id: "cni", label: strings.boot.phaseLabels.cni },
  { id: "ingress", label: strings.boot.phaseLabels.ingress },
  { id: "seed", label: strings.boot.phaseLabels.seed },
  { id: "finalize", label: strings.boot.phaseLabels.finalize },
];

function parseStamp(stamp: string | undefined): number | null {
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

export function BootProgress({ boot, onRetry }: BootProgressProps) {
  const failed = boot?.state === "failed";
  const titleId = useId();
  const now = useTick(!failed);

  const started = parseStamp(boot?.startedAt);
  const elapsed = started === null ? null : formatElapsed(now - started);

  const currentIndex = (() => {
    const byId = PHASES.findIndex((p) => p.id === boot?.phase);
    if (byId !== -1) return byId;
    if (boot?.step) return Math.min(boot.step - 1, PHASES.length - 1);
    return 0;
  })();

  return (
    <div className="boot-screen">
      <div className="boot-panel" role="group" aria-labelledby={titleId}>
        <h1 id={titleId}>{failed ? strings.boot.failedTitle : strings.boot.title}</h1>

        <p className="control-status" role="status" aria-live="polite" aria-atomic="true">
          {failed
            ? ""
            : boot
              ? strings.boot.stepOf(
                  currentIndex + 1,
                  PHASES.length,
                  boot.label || PHASES[currentIndex].label,
                )
              : strings.boot.unreachable}
        </p>

        <ul className="control-phases" aria-label={strings.boot.progressLabel}>
          {PHASES.map((phase, i) => {
            const state =
              failed && i === currentIndex
                ? "failed"
                : i < currentIndex
                  ? "done"
                  : i === currentIndex && boot
                    ? "running"
                    : "pending";

            const label = state === "running" && boot?.label ? boot.label : phase.label;
            return (
              <li key={phase.id} className={`phase-${state}`}>
                {state === "running" ? (
                  <span className="phase-mark phase-mark-spinner" aria-hidden="true" />
                ) : (
                  <span className="phase-mark" aria-hidden="true">
                    {state === "done" ? (
                      <Icon name="check" />
                    ) : state === "failed" ? (
                      <Icon name="cross" />
                    ) : (
                      "·"
                    )}
                  </span>
                )}
                <span className="phase-label">{label}</span>

                {state === "running" && boot?.detail && (
                  <span className="phase-detail" aria-hidden="true">
                    {boot.detail}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {failed ? (
          <>
            <p className="error-text" role="alert">
              {boot?.error}
            </p>
            <p className="control-hint">{strings.boot.failedHint}</p>
            <div className="control-actions">
              <button className="btn btn-primary" onClick={() => void onRetry()}>
                {strings.boot.retry}
              </button>
            </div>
          </>
        ) : (
          <p className="control-hint">
            {strings.boot.hint}
            {elapsed && (
              <span className="control-elapsed" aria-hidden="true">
                {strings.boot.elapsed(elapsed)}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
