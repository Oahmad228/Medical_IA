import React from "react";

// [Module: src/components/ui/ModalShell.jsx]
// Reusable modal shell with consistent layout and close handling.
export default function ModalShell({ open, title, onClose, wide = false, disableClose = false, children }) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={disableClose ? undefined : onClose}
    >
      <div
        className={`modal-window${wide ? " modal-window--wide" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          {!disableClose ? (
            <button type="button" className="ghost modal-close" onClick={onClose}>
              Fermer
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
