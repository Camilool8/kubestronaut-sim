import { useCallback, useState } from "react";
import { getHint, getSolution, reseedQuestion, type HintDetail } from "../api";
import { Markdown } from "./Markdown";
import { Dialog } from "./Dialog";
import { toastStore } from "./toastStore";
import { strings } from "../strings";

interface HintTrayProps {
  questionId: string;
  hintCount: number;
}

/**
 * Progressive hints, plus the solution, for a training attempt.
 *
 * Revealed one tier at a time and fetched on demand — not because the
 * content is secret (every hints.md sits on the candidate's own disk,
 * exactly as PRODUCT.md says of solutions), but because a tray that
 * already holds the answer is one accidental scroll away from removing
 * the exercise. Taking a hint should be a decision.
 *
 * Rendered only in training mode; the endpoints 403 everywhere else, so
 * this is a UI affordance over a server-side rule rather than the rule
 * itself.
 */
export function HintTray({ questionId, hintCount }: HintTrayProps) {
  const [hints, setHints] = useState<HintDetail[]>([]);
  const [solution, setSolution] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  // No reset effect here on purpose. A revealed hint belongs to the
  // question it was revealed for, and the call site already keys this
  // component by question id — so moving question remounts it and the
  // state starts empty. Resetting in an effect instead would do the same
  // job a render later, and trips react-hooks v7's
  // set-state-in-effect rule for the trouble.

  const revealNext = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await getHint(questionId, hints.length + 1);
      if (res.ok) {
        setHints((prev) => [...prev, res.hint]);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(strings.hints.failed(String(err)));
    } finally {
      setBusy(false);
    }
  }, [questionId, hints.length]);

  const revealSolution = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await getSolution(questionId);
      if (res.ok) {
        setSolution(res.solution.markdown);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(strings.hints.failed(String(err)));
    } finally {
      setBusy(false);
    }
  }, [questionId]);

  const reseed = useCallback(async () => {
    setResetting(true);
    try {
      const res = await reseedQuestion(questionId);
      toastStore.push({
        kind: res.ok ? "info" : "warning",
        message: res.ok ? strings.hints.reseedDone : strings.hints.reseedFailed(res.error),
        dedupeKey: "reseed",
      });
    } catch (err) {
      toastStore.push({
        kind: "warning",
        message: strings.hints.reseedFailed(String(err)),
        dedupeKey: "reseed",
      });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }, [questionId]);

  const more = hints.length < hintCount;

  return (
    <div className="hint-tray">
      {hints.map((h) => (
        <section key={h.tier} className="hint">
          <h3>{strings.hints.heading(h.tier, h.total)}</h3>
          <Markdown>{h.markdown}</Markdown>
        </section>
      ))}

      {solution !== null && (
        <section className="hint hint-solution">
          <h3>{strings.hints.showSolution}</h3>
          <Markdown>{solution}</Markdown>
        </section>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className="hint-actions">
        {more && (
          <button className="btn" onClick={() => void revealNext()} disabled={busy}>
            {strings.hints.show(hints.length + 1, hintCount)}
          </button>
        )}
        {/* Only offered once every hint has been taken. Jumping straight
            to the answer is always possible — the file is on disk — but
            the tray should not make it the path of least resistance. */}
        {!more && solution === null && (
          <button className="btn" onClick={() => void revealSolution()} disabled={busy}>
            {strings.hints.showSolution}
          </button>
        )}
        {/* Behind a confirm because it is the only control in training
            mode that destroys work, and it sits next to two that do not. */}
        <button className="btn" onClick={() => setConfirmReset(true)} disabled={resetting}>
          {resetting ? strings.hints.reseeding : strings.hints.reseed}
        </button>
      </div>

      {confirmReset && (
        <Dialog title={strings.hints.reseedTitle} onClose={() => setConfirmReset(false)}>
          <p>{strings.hints.reseedBody}</p>
          <div className="control-actions">
            <button className="btn" onClick={() => setConfirmReset(false)} disabled={resetting}>
              {strings.exam.cancel}
            </button>
            <button className="btn btn-danger" onClick={() => void reseed()} disabled={resetting}>
              {resetting ? strings.hints.reseeding : strings.hints.reseedConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
