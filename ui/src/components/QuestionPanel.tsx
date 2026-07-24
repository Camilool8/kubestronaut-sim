import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getQuestion, type ExamQuestionInfo } from "../api";

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

  useEffect(() => {
    if (!selectedId) {
      setMarkdown("");
      return;
    }
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
        aria-label={open ? "Collapse question panel" : "Expand question panel"}
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
                  <span className="question-points">{q.totalPoints} pts</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="question-markdown">
            {loading && <p>Loading…</p>}
            {error && <p className="error-text">{error}</p>}
            {!loading && !error && <ReactMarkdown>{markdown}</ReactMarkdown>}
          </div>
        </>
      )}
    </div>
  );
}
