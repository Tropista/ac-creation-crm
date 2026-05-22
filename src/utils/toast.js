const listeners = new Set();
let toasts = [];
let nextId = 0;

function emit() {
  for (const listener of listeners) {
    listener(toasts);
  }
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function showToast(message, type = "info", durationMs = 4000) {
  const toast = {
    id: ++nextId,
    message,
    type,
  };

  toasts = [...toasts, toast].slice(-5);
  emit();

  if (durationMs > 0) {
    setTimeout(() => dismissToast(toast.id), durationMs);
  }

  return toast.id;
}

export function dismissToast(id) {
  toasts = toasts.filter((entry) => entry.id !== id);
  emit();
}
