import { useId } from "react";
import type { SessionSnapshot } from "../api";
import { formatClock, formatClockSpoken, formatElapsed } from "../lib/format";
import { useExamClock } from "../lib/useExamClock";
import { strings } from "../strings";

export interface SubmitReviewItem {
  id: string;
  label: string;
  jumpLabel: string;
}

export interface SubmitReviewGroup {
  key: string;
  heading: string;
  items: SubmitReviewItem[];
}

interface SubmitReviewProps {
  session: SessionSnapshot;
  fetchedAt: number;
  groups: SubmitReviewGroup[];

  note?: string;
  onJump: (id: string) => void;
}

export function SubmitReview({ session, fetchedAt, groups, note, onJump }: SubmitReviewProps) {
  const shown = groups.filter((g) => g.items.length > 0);

  return (
    <div className="submit-review">
      <ReviewClock session={session} fetchedAt={fetchedAt} />
      {note && <p>{note}</p>}
      {shown.map((group) => (
        <ReviewGroup key={group.key} group={group} onJump={onJump} />
      ))}
      {shown.length > 0 && <p className="submit-review-hint">{strings.exam.reviewJumpHint}</p>}
    </div>
  );
}

function ReviewClock({ session, fetchedAt }: { session: SessionSnapshot; fetchedAt: number }) {
  const { remaining, elapsed, untimed } = useExamClock(session, fetchedAt);

  if (untimed) {
    return (
      <p className="submit-review-clock">{strings.exam.reviewUntimed(formatElapsed(elapsed))}</p>
    );
  }
  return (
    <p className="submit-review-clock">
      <span aria-hidden="true">{strings.exam.reviewTimeLeft(formatClock(remaining))}</span>
      <span className="sr-only">{strings.exam.timeRemaining(formatClockSpoken(remaining))}</span>
    </p>
  );
}

function ReviewGroup({
  group,
  onJump,
}: {
  group: SubmitReviewGroup;
  onJump: (id: string) => void;
}) {
  const headingId = useId();
  return (
    <div className="submit-review-group">
      <p id={headingId}>{group.heading}</p>
      <ul className="submit-review-ids" aria-labelledby={headingId}>
        {group.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="submit-review-jump"
              aria-label={item.jumpLabel}
              onClick={() => onJump(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
