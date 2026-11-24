import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { modalExemptProps } from "../lib/modalLayer";
import { toastStore } from "./toastStore";
import { strings } from "../strings";

export function ToastLayer() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.list);

  const infos = toasts.filter((t) => t.kind === "info");
  const warnings = toasts.filter((t) => t.kind === "warning");

  return createPortal(
    <div className="toast-layer" {...modalExemptProps}>
      <div role="status" aria-live="polite" className="toast-region">
        {infos.map((t) => (
          <ToastCard key={t.id} id={t.id} kind={t.kind} message={t.message} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" className="toast-region">
        {warnings.map((t) => (
          <ToastCard key={t.id} id={t.id} kind={t.kind} message={t.message} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function ToastCard({ id, kind, message }: { id: number; kind: string; message: string }) {
  return (
    <div className={`toast toast-${kind}`}>

      {kind === "warning" && (
        <span className="toast-mark" aria-hidden="true">
          !
        </span>
      )}
      <span className="toast-message">{message}</span>
      <button
        className="toast-dismiss"
        onClick={() => toastStore.dismiss(id)}
        aria-label={strings.toast.dismiss}
      >
        ×
      </button>
    </div>
  );
}
