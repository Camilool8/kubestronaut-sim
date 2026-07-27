// Shared vocabulary for "something is happening". The product has four
// tiers and each one uses exactly one mechanism:
//
//   ambient     TopProgress            a foreground request the user is
//                                      waiting on. Never pollers.
//   inline      <Async loading={…}>    this region is fetching.
//   blocking    ControlProgress        a multi-minute destructive job owns
//                                      the screen.
//   background  BackgroundJobChip      a backgrounded job is still running.
//
// The rule that makes all four work: **every pending state carries at least
// one channel that changes without motion** — an elapsed counter, a step
// label, an attempt number. Motion layers on top, additively, inside
// prefers-reduced-motion: no-preference. Before this rule the reduced-motion
// experience of a wait was a static accent line indistinguishable from a
// decorative border, which is not a pending state at all.

/**
 * A local indeterminate bar. Not the fixed TopProgress: that one means "a
 * foreground request is in flight", and a poll or a long server-side job is
 * neither. Always pair it with something that changes without motion.
 *
 * Pass `label` only when this bar is the thing announcing the wait. Inside a
 * region that already has its own `role="status"` — the desktop reconnect
 * overlay, for one — leave it off: nested live regions announce twice, and
 * the outer one is the one carrying the words.
 */
export function PendingBar({ label }: { label?: string }) {
  if (!label) {
    return (
      <div className="pending-bar" aria-hidden="true">
        <div className="pending-bar-fill" />
      </div>
    );
  }
  return (
    <div className="pending-bar" role="status">
      <span className="sr-only">{label}</span>
      <div className="pending-bar-fill" />
    </div>
  );
}

/**
 * A placeholder shaped like the content that will replace it. Shaped, not
 * generic: a block the wrong size for text is what makes it read as "not
 * loaded yet" rather than as an empty region, which is what keeps it
 * legible when the pulse is switched off.
 */
export function Skeleton({ width, className }: { width?: string; className?: string }) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}
