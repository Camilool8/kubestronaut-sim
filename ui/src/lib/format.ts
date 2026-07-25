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

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
