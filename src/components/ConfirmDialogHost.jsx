import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { subscribeConfirmActions } from "../utils/confirmAction";
import "../styles/confirm-dialog.css";

export default function ConfirmDialogHost() {
  const [dialog, setDialog] = useState(null);
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    return subscribeConfirmActions((payload) => {
      setDialog(payload);
    });
  }, []);

  const close = useCallback((value) => {
    if (!dialog) return;
    const resolve = dialog.resolve;
    setDialog(null);
    resolve(Boolean(value));
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;

    const previousActive = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    setTimeout(() => cancelButtonRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousActive?.focus?.();
    };
  }, [dialog, close]);

  if (!dialog) return null;

  const Icon = dialog.danger ? AlertTriangle : CheckCircle2;

  return (
    <div
      className="confirm-dialog"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close(false);
      }}
    >
      <section
        className={`confirm-dialog__panel${dialog.danger ? " confirm-dialog__panel--danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="confirm-dialog__icon" aria-hidden="true">
          <Icon size={22} />
        </div>
        <button
          type="button"
          className="confirm-dialog__close"
          aria-label="Fermer"
          onClick={() => close(false)}
        >
          <X size={18} />
        </button>
        <div className="confirm-dialog__content">
          <h2 id="confirm-dialog-title">{dialog.title}</h2>
          <p id="confirm-dialog-message">{dialog.message}</p>
          {dialog.detail ? <p className="confirm-dialog__detail">{dialog.detail}</p> : null}
        </div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__cancel"
            ref={cancelButtonRef}
            onClick={() => close(false)}
          >
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog__confirm${dialog.danger ? " confirm-dialog__confirm--danger" : ""}`}
            onClick={() => close(true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
