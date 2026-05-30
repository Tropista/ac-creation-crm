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

const eurFmt = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const KNOWN_TSHIRT_COLORS = {
  "#ffffff": "blanc",
  "#fff": "blanc",
  "#000000": "noir",
  "#000": "noir",
  "#111827": "anthracite",
  "#ef4444": "rouge",
  "#3b82f6": "bleu",
  "#22c55e": "vert",
  "#eab308": "jaune",
  "#f97316": "orange",
  "#a855f7": "violet",
  "#ec4899": "rose",
  "#6b7280": "gris",
};

/** Libellé couleur pour la ligne devis (hex ou nom lisible). */
export function formatTshirtColorLabel(color = "") {
  const raw = String(color || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  if (KNOWN_TSHIRT_COLORS[normalized]) return KNOWN_TSHIRT_COLORS[normalized];
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  return raw;
}

/** Description minimale pour la ligne devis configurateur t-shirt. */
export function buildTshirtConfiguratorQuoteDescription({ tshirtColor = "" } = {}) {
  const colorLabel = formatTshirtColorLabel(tshirtColor);
  return colorLabel ? `T-shirt ${colorLabel}` : "T-shirt";
}

/** Notes atelier détaillées (hors champ description de la ligne). */
export function buildTshirtConfiguratorWorkshopNotes({
  projectName = "",
  garmentSize = "",
  garmentPresetLabel = "",
  tshirtColor = "",
  techniqueSummary = "",
  quantity = 1,
  totalUnitHT = 0,
  markings = [],
} = {}) {
  const label = String(projectName || "").trim() || "T-shirt";
  const qty = Math.max(1, Number(quantity) || 1);
  const sizePart = garmentSize
    ? garmentPresetLabel && garmentPresetLabel !== garmentSize
      ? `${garmentSize} (${garmentPresetLabel})`
      : garmentSize
    : garmentPresetLabel || "";

  const meta = [
    `Qté ${qty}`,
    sizePart,
    tshirtColor ? `Couleur ${formatTshirtColorLabel(tshirtColor)}` : "",
    techniqueSummary,
  ].filter(Boolean);

  const header = [label, meta.join(" · "), `Total marquage : ${eurFmt.format(totalUnitHT)} € HT/pièce`].join(
    "\n"
  );

  const markingLines = (markings || []).map((entry) => {
    const zone = entry.zone || "Zone";
    const content = entry.content || "—";
    const technique = entry.technique || "—";
    const w = Number(entry.width || 0).toFixed(1);
    const h = Number(entry.height || 0).toFixed(1);
    const price = eurFmt.format(Number(entry.unitPrice || 0));
    return `${zone} : ${content} — ${technique} ${w}×${h} cm · ${price} € HT`;
  });

  return markingLines.length ? `${header}\n${markingLines.join("\n")}` : header;
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
