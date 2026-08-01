import type { QuestionResult } from "../api";
import { Icon } from "./Icon";
import { strings } from "../strings";

const LETTERS = "ABCDEF";

// The mcq counterpart of CheckList: instead of a table of validate.d
// checks, every option with what happened to it — correct and selected,
// correct but missed, selected but wrong. State is carried by an icon
// AND text on every marked row, never colour alone.
export function McqAnswerReview({ question }: { question: QuestionResult }) {
  const selected = new Set(question.selected ?? []);
  const correct = new Set(question.correct ?? []);

  return (
    <div className="mcq-review">
      <p className="mcq-review-summary">
        <span className="mcq-review-label">{strings.mcq.yourAnswer}:</span>{" "}
        {selected.size > 0
          ? [...selected].sort((a, b) => a - b).map((i) => LETTERS[i]).join(", ")
          : strings.mcq.notAnswered}
        {" · "}
        <span className="mcq-review-label">{strings.mcq.correctAnswer}:</span>{" "}
        {[...correct].sort((a, b) => a - b).map((i) => LETTERS[i]).join(", ")}
      </p>
      <ul className="mcq-review-options">
        {(question.options ?? []).map((text, i) => {
          const isCorrect = correct.has(i);
          const isSelected = selected.has(i);
          let state = "";
          let icon: "check" | "cross" | null = null;
          let label: string | null = null;
          if (isCorrect && isSelected) {
            state = " mcq-review-correct";
            icon = "check";
            label = strings.mcq.optionCorrectSelected;
          } else if (isCorrect) {
            state = " mcq-review-missed";
            icon = "check";
            label = strings.mcq.optionCorrectMissed;
          } else if (isSelected) {
            state = " mcq-review-wrong";
            icon = "cross";
            label = strings.mcq.optionWrongSelected;
          }
          return (
            <li key={i} className={`mcq-review-option${state}`}>
              <span className="mcq-option-letter" aria-hidden="true">
                {LETTERS[i]}
              </span>
              <span className="mcq-option-text">
                <span className="sr-only">{LETTERS[i]}. </span>
                {text}
              </span>
              {icon && (
                <span className="mcq-review-state">
                  <Icon name={icon} />
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
