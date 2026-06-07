const listeners = new Set();

export function subscribeConfirmActions(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function confirmAction(options = {}) {
  const payload =
    typeof options === "string"
      ? { message: options }
      : { ...options };

  if (!listeners.size) {
    console.warn("ConfirmDialogHost absent — action annulée par sécurité.");
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const [listener] = listeners;
    listener({
      title: payload.title || "Confirmer l'action",
      message: payload.message || "Confirmer cette action ?",
      detail: payload.detail || "",
      confirmLabel: payload.confirmLabel || "Confirmer",
      cancelLabel: payload.cancelLabel || "Annuler",
      danger: Boolean(payload.danger),
      resolve,
    });
  });
}
