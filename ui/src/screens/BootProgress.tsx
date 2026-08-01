import { useId } from "react";
import type { BootStatus } from "../api";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { Icon } from "../components/Icon";
import { strings } from "../strings";

interface BootProgressProps {
  /** null while the very first /api/boot call is still in flight. */
  boot: BootStatus | null;
  onRetry: () => void | Promise<void>;
}

// The phase sequence, mirroring the `phase` calls in
// images/k8s-env/{start,bootstrap}.sh. The server reports only the step
// it is on; the full list lives here so the screen can show a
// determinate checklist rather than a lone spinner.
//
// Determinate on purpose: a bar that fills at an unknowable rate reads as
// a stall, while "step 5 of 8, three ticked" is legible at a glance and
// survives a phase that legitimately takes four minutes. If the two lists
// ever drift, the server's own label wins for the running step (below),
// so the worst case is a mislabelled future step — never a wrong "now".
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

/**
 * Full-screen progress for the environment's own start-up.
 *
 * This exists because the facilitator used to wait for a healthy cluster
 * before serving anything, so the browser showed nothing at all for the
 * whole of a cold first boot. The stack now starts the other way round —
 * the UI comes up first and narrates what is still being built.
 */
export function BootProgress({ boot, onRetry }: BootProgressProps) {
  const failed = boot?.state === "failed";
  const titleId = useId();
  const now = useTick(!failed);

  const started = parseStamp(boot?.startedAt);
  const elapsed = started === null ? null : formatElapsed(now - started);

  // Index of the running phase. Falls back to the server's step number
  // when the id is one this build does not know about, so a bank or image
  // that adds a phase degrades to a number instead of to nothing.
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

        {/* One polite line, changing only when the phase changes — so a
            screen reader hears eight updates across a ten-minute build
            rather than one per second. The ticking durations below sit
            outside it deliberately. */}
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
            // The server's label is authoritative for the step actually
            // running; the table above supplies the rest.
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
                {/* Seeding 22 questions is the longest phase of a cold
                    boot by a wide margin. Counting through it is the
                    difference between informing and merely proving the
                    page still renders. */}
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
