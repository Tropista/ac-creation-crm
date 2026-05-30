/** Nettoyage défensif des overlays / portails qui bloquent la sidebar ou la navigation. */

export const CRM_ROUTE_CHANGE_EVENT = "crm-route-change";

const BODY_LOCK_CLASSES = ["sidebar-drawer-open", "crm-modal-open", "crm-scroll-lock"];

export function cleanupBodyLocks() {
  if (typeof document === "undefined") return;

  BODY_LOCK_CLASSES.forEach((className) => {
    document.body.classList.remove(className);
  });
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("pointer-events");
}

export function cleanupOrphanDomNodes({ removePreviewOverlay = false } = {}) {
  if (typeof document === "undefined") return;

  document.querySelectorAll(".ac-doc-pdf-root").forEach((node) => node.remove());
  document.querySelectorAll(".product-picker__list--fixed").forEach((node) => node.remove());

  // Ne pas retirer l'aperçu React actif (Fermer) — laisser le démontage à React.
  if (removePreviewOverlay) {
    document.querySelectorAll(".document-preview-overlay").forEach((node) => node.remove());
  }
}

export function cleanupNavigationBlockers(options = {}) {
  cleanupBodyLocks();
  cleanupOrphanDomNodes(options);
}

export function dispatchRouteChange(pathname) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CRM_ROUTE_CHANGE_EVENT, {
      detail: { pathname: String(pathname || "") },
    })
  );
}
