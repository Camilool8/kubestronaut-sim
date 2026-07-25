import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { getQuestion, type ExamQuestionInfo } from "../api";
import { desktopClipboard } from "../lib/desktopClipboard";
import { strings } from "../strings";
import { toastStore } from "./toastStore";

// Bank questions mark every value a candidate must reproduce exactly —
// resource names, labels, image tags, /opt/course paths — as inline
// code. Rendering those as buttons turns "retype this without a typo"
// into one click, and the click pushes the value straight into the exam
// desktop's clipboard so it can be pasted in the terminal.
function CopyableCode({ children }: { children: ReactNode }) {
  const value = typeof children === "string" ? children : String(children ?? "");

  const copy = async () => {
    const outcome = await desktopClipboard.copy(value);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.questionPanel.copiedToDesktop(value)
          : outcome === "browser"
            ? strings.questionPanel.copied(value)
            : strings.questionPanel.copyFailed,
      dedupeKey: "copy-value",
    });
  };

  return (
    <button
      type="button"
      className="copy-value"
      onClick={copy}
      aria-label={strings.questionPanel.copyValue(value)}
    >
      <code>{children}</code>
      <span className="copy-value-icon" aria-hidden="true">
        ⧉
      </span>
    </button>
  );
}

// Only inline code becomes a copy button. A fenced block renders inside
// <pre>, where react-markdown still routes through `code` — turning a
// whole listing into one button would be a worse affordance than
// selecting the lines you want.
const MARKDOWN_COMPONENTS = {
  code: ({ children, className }: { children?: ReactNode; className?: string }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <CopyableCode>{children}</CopyableCode>
    ),
};

interface QuestionPanelProps {
  questions: ExamQuestionInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}

// Collapsible left panel: a question list (id + domain + points badge)
// and, below it, the selected question's markdown rendered via
// react-markdown (default renderer, no plugins — the bank's markdown
// is plain GitHub-ish markdown).
export function QuestionPanel({
  questions,
  selectedId,
  onSelect,
  open,
  onToggle,
}: QuestionPanelProps) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = questions.find((q) => q.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getQuestion(selectedId)
      .then((q) => {
        if (!cancelled) setMarkdown(q.markdown);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className={`question-panel${open ? "" : " collapsed"}`}>
      <button
        className="panel-toggle"
        onClick={onToggle}
        aria-label={open ? strings.questionPanel.collapse : strings.questionPanel.expand}
      >
        {open ? "«" : "»"}
      </button>
      {open && (
        <>
          <ul className="question-list">
            {questions.map((q) => (
              <li key={q.id}>
                <button
                  className={`question-item${q.id === selectedId ? " selected" : ""}`}
                  onClick={() => onSelect(q.id)}
                >
                  <span className="question-id">{q.id}</span>
                  <span className="question-domain">{q.domain}</span>
                  <span className="question-points">{strings.questionPanel.points(q.totalPoints)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <span className="instance-chip">
              {strings.questionPanel.sshHint(selected.instance)}
            </span>
          )}
          <div className="question-markdown">
            {loading && <p>{strings.questionPanel.loading}</p>}
            {error && <p className="error-text">{error}</p>}
            {!loading && !error && (
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                {selectedId ? markdown : ""}
              </ReactMarkdown>
            )}
          </div>
        </>
      )}
    </div>
  );
}
