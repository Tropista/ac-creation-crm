/** Desktop Electron (preload) or dist loaded via file:// in packaged builds. */
export function isElectronApp() {
  if (typeof window === "undefined") return false;
  return (
    window.electronAPI?.isElectron === true ||
    window.location.protocol === "file:"
  );
}

/** PWA service worker is only useful on HTTPS deployments, not Electron/file://. */
export function shouldRegisterServiceWorker() {
  return (
    import.meta.env.PROD &&
    typeof window !== "undefined" &&
    !isElectronApp() &&
    "serviceWorker" in navigator
  );
}

/** Remove stale SW registrations (e.g. devtools testing or profile reuse). */
export async function unregisterServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Non-fatal — Electron/file:// usually has none.
  }
}
