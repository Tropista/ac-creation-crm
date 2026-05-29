import { isHashRouterMode, pageToPath } from "./routes";
import { sanitizeQuoteAttachmentsForPersistence } from "./quoteAttachments";

export const QUOTE_DRAFT_KEY = "crm_quote_draft";

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

export function openQuoteFromCalculator(navigate, draft) {
  const payload = {
    clientId: draft.clientId || "",
    lines: draft.lines || [],
    attachments: draft.attachments || [],
    source: draft.source || "calculateur",
    notes: draft.notes || "",
    calculatorProjectId: draft.calculatorProjectId || "",
  };
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
