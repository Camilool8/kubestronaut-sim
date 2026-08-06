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

export function Skeleton({ width, className }: { width?: string; className?: string }) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}
