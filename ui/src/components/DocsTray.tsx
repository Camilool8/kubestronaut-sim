import { useCallback, useState } from "react";
import { getQuestionDocs, openQuestionDoc, type SolutionDoc } from "../api";
import { useAsync } from "../lib/useAsync";
import { Icon } from "./Icon";
import { toastStore } from "./toastStore";
import { strings } from "../strings";

interface DocsTrayProps {
  questionId: string;
}

/**
 * The upstream pages a question's author thought explained its subject,
 * offered during a Training attempt only.
 *
 * The links open on the exam desktop rather than in this tab, because that is
 * where the candidate is working and where the docs proxy applies. Nothing is
 * rendered until the server has confirmed there are links to show and that the
 * mode allows them, so a refusal is simply an empty tray.
 */
export function DocsTray({ questionId }: DocsTrayProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    (signal: AbortSignal) => getQuestionDocs(questionId, signal),
    [questionId],
  );
  const docs = useAsync(load, [questionId], { background: true });

  const open = async (doc: SolutionDoc) => {
    setBusy(doc.url);
    try {
      const res = await openQuestionDoc(questionId, doc.url);
      toastStore.push({
        kind: res.ok ? "info" : "warning",
        message: res.ok
          ? strings.hints.docsOpened(doc.label)
          : strings.hints.docsFailed(res.error),
        dedupeKey: "docs-open",
      });
    } catch (err) {
      toastStore.push({
        kind: "warning",
        message: strings.hints.docsFailed(String(err)),
        dedupeKey: "docs-open",
      });
    } finally {
      setBusy(null);
    }
  };

  const links = docs.data?.ok ? docs.data.docs : [];
  if (links.length === 0) return null;

  return (
    <section className="docs-tray">
      <h3>{strings.hints.docsTitle}</h3>

      <ul className="docs-tray-list">
        {links.map((doc) => (
          <li key={doc.url}>
            <button
              type="button"
              className="docs-tray-link"
              onClick={() => void open(doc)}
              disabled={busy !== null}
              aria-label={strings.hints.docsOpen(doc.label)}
            >
              <Icon name="book" className="docs-tray-glyph" />
              {doc.label}
            </button>
          </li>
        ))}
      </ul>

      <p className="docs-tray-hint">{strings.hints.docsHint}</p>
    </section>
  );
}
