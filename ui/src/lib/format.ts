// Shared time formatters. formatDuration is the human-friendly form used
// on summary surfaces ("2h", "1h 30m"); formatClock is the ticking
// H:MM:SS countdown used by the timer.

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// formatElapsed renders a span in milliseconds as a duration for the
// control-job checklist. The precision steps down as the span grows:
// several phases finish in well under a second and would otherwise all
// read "0s", while a cluster rebuild runs for minutes and doesn't want
// a jittering decimal.
export function formatElapsed(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) return `${(clamped / 1000).toFixed(1)}s`;
  const seconds = Math.floor(clamped / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  const hours = Math.floor(seconds / 3600);
  return `${hours}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
