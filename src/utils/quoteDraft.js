import { isHashRouterMode, pageToPath } from "./routes";
import { sanitizeQuoteAttachmentsForPersistence } from "./quoteAttachments";

export const QUOTE_DRAFT_KEY = "crm_quote_draft";
export const INVOICE_DRAFT_KEY = "crm_invoice_draft";

const appliedDraftTokens = new Set();

export function getQuoteDraftToken(draft) {
  if (!draft) return "";
  return `${draft.source || ""}|${draft.savedAt || ""}|${(draft.lines || []).length}`;
}

export function markQuoteDraftApplied(draft) {
  const token = getQuoteDraftToken(draft);
  if (token) appliedDraftTokens.add(token);
}

export function wasQuoteDraftApplied(draft) {
  return appliedDraftTokens.has(getQuoteDraftToken(draft));
}

export function clearQuoteDraft() {
  localStorage.removeItem(QUOTE_DRAFT_KEY);
}

export function clearInvoiceDraft() {
  localStorage.removeItem(INVOICE_DRAFT_KEY);
}

/** Navigation menu / tableau de bord : liste devis sans ré-appliquer un brouillon. */
export const QUOTES_LIST_NAV_STATE = { quotesListView: true };

export const QUOTES_LIST_VIEW_EVENT = "crm-quotes-list-view";

export function requestQuotesListView() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUOTES_LIST_VIEW_EVENT));
  }
}

export function navigateToQuotesList(navigate) {
  navigate(pageToPath("quotes"), { state: QUOTES_LIST_NAV_STATE });
}

/** Navigation menu / tableau de bord : liste factures sans formulaire / aperçu bloquants. */
export const INVOICES_LIST_NAV_STATE = { invoicesListView: true };

export const INVOICES_LIST_VIEW_EVENT = "crm-invoices-list-view";

export function requestInvoicesListView() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INVOICES_LIST_VIEW_EVENT));
  }
}

export function navigateToInvoicesList(navigate) {
  navigate(pageToPath("invoices"), { state: INVOICES_LIST_NAV_STATE });
}

/** Lien vers la page Factures (compatible Electron file:// + hash). */
export function getCrmInvoicesUrl() {
  const path = pageToPath("invoices");
  if (typeof window === "undefined") return path;
  if (isHashRouterMode()) {
    return `${window.location.pathname}#${path}`;
  }
  return path;
}

/** Lien vers la page Devis (compatible Electron file:// + hash). */
export function getCrmQuotesUrl() {
  const path = pageToPath("quotes");
  if (typeof window === "undefined") return path;
  if (isHashRouterMode()) {
    return `${window.location.pathname}#${path}`;
  }
  return path;
}

export function saveQuoteDraft(draft) {
  localStorage.setItem(
    QUOTE_DRAFT_KEY,
    JSON.stringify({
      ...draft,
      attachments: sanitizeQuoteAttachmentsForPersistence(draft.attachments || []),
      savedAt: Date.now(),
    })
  );
}

export function peekQuoteDraft() {
  const raw = localStorage.getItem(QUOTE_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function consumeQuoteDraft() {
  const draft = peekQuoteDraft();
  if (draft) {
    localStorage.removeItem(QUOTE_DRAFT_KEY);
  }
  return draft;
}

/** Payload léger pour localStorage + state React Router (évite dépassement history.state). */
export function buildQuoteDraftPayload(draft) {
  const attachments = sanitizeQuoteAttachmentsForPersistence(draft.attachments || []);
  return {
    clientId: draft.clientId || "",
    lines: Array.isArray(draft.lines) ? draft.lines : [],
    attachments,
    source: draft.source || "calculateur",
    notes: draft.notes || "",
    calculatorProjectId: draft.calculatorProjectId || "",
    savedAt: Date.now(),
  };
}

/** Fusionne le brouillon navigation et localStorage (localBlobId, lignes). */
export function mergeQuoteDraftSources(stateDraft, storageDraft) {
  const state = stateDraft && typeof stateDraft === "object" ? stateDraft : null;
  const storage = storageDraft && typeof storageDraft === "object" ? storageDraft : null;
  if (!state && !storage) return null;
  if (!state) return storage;
  if (!storage) return state;

  return {
    ...storage,
    ...state,
    lines: state.lines?.length ? state.lines : storage.lines || [],
    attachments: state.attachments?.length ? state.attachments : storage.attachments || [],
    notes: state.notes || storage.notes || "",
    clientId: state.clientId || storage.clientId || "",
    calculatorProjectId: state.calculatorProjectId || storage.calculatorProjectId || "",
  };
}

/** Lit le brouillon sans le retirer du localStorage (consommé après application réussie). */
export function resolveQuoteDraftForApply(locationState) {
  const stateDraft = locationState?.quoteDraft;
  const storageDraft = peekQuoteDraft();
  return mergeQuoteDraftSources(stateDraft, storageDraft);
}

export function openQuoteFromCalculator(navigate, draft) {
  const payload = buildQuoteDraftPayload(draft);
  saveQuoteDraft(payload);
  navigate(pageToPath("quotes"), { state: { quoteDraft: payload } });
}


export function buildCalculatorQuoteLine({
  description,
  quantity = 1,
  priceHT = 0,
  sku = "",
  category = "",
  taille = "",
  couleur = "",
  emplacementMarquage = "",
  technique = "",
}) {
  return {
    productId: "",
    sku,
    category,
    description,
    quantity: Number(quantity) || 1,
    price: Number(priceHT) || 0,
    discount: 0,
    taille,
    couleur,
    emplacementMarquage,
    technique,
  };
}
