import { isHashRouterMode, pageToPath } from "./routes";
import { openQuoteFromCalculator } from "./quoteDraft";
import { stripSourceFromDescription } from "./catalogDescription";
import {
  enrichCatalogColors,
  resolveCatalogColorImageUrl,
  resolveCatalogColorLabel,
} from "./colorNameToHex";

export const PUBLIC_CATALOG_PATH = "/catalogue";

export const PUBLIC_CATALOG_CACHE_PREFIX = "crm_catalog_public_";

export const DEFAULT_CATALOG_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

export const DEFAULT_CATALOG_RECIPIENT_EMAIL = "ac.creation.officiel@gmail.com";

export const LEGACY_CATALOG_RECIPIENT_EMAIL = "contact@monentreprise.com";

function normalizeCatalogRecipientEmail(value) {
  const email = String(value || "").trim();
  if (!email || email === LEGACY_CATALOG_RECIPIENT_EMAIL) return "";
  return email;
}

const PUBLIC_CATALOG_CACHE_MAX_ENTRIES = 8;
const SNAPSHOT_DESCRIPTION_MAX_LENGTH = 1500;

export function sanitizeImageUrlForCache(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed || trimmed.startsWith("data:image/")) return "";
  return trimmed;
}

function colorHasHttpImageUrl(color) {
  if (!color || typeof color !== "object") return false;
  return Boolean(sanitizeImageUrlForCache(resolveCatalogColorImageUrl(color)));
}

/** True when snapshots lack http image URLs and a live catalog fetch may help. */
export function catalogProductsNeedLiveImageMerge(products = []) {
  if (!Array.isArray(products) || !products.length) return false;

  return products.some((product) => {
    if (!sanitizeImageUrlForCache(product?.imageUrl)) return true;
    const colors = Array.isArray(product?.colors) ? product.colors : [];
    if (!colors.length) return false;
    return colors.some((color) => !colorHasHttpImageUrl(color));
  });
}

/** Image shown for a product card: per-color packshot, else default product image. */
export function resolveProductDisplayImage(product, colorLabel) {
  if (!product) return "";
  const colors = enrichCatalogColors(product.colors || []);
  const match = colors.find((color) => resolveCatalogColorLabel(color) === colorLabel);
  const colorImage = match ? resolveCatalogColorImageUrl(match) : "";
  const defaultImage = sanitizeImageUrlForCache(product.imageUrl);
  return colorImage || defaultImage || "";
}

export function sanitizeColorForSnapshot(color) {
  if (typeof color === "string") {
    const name = color.trim();
    return name || "";
  }
  if (!color || typeof color !== "object") return "";

  const name = String(color.name || color.label || "").trim();
  const hex = String(color.hex || color.value || color.color || "").trim();
  const imageUrl = sanitizeImageUrlForCache(color.imageUrl);
  if (!name) return "";
  if (hex || imageUrl) {
    return {
      name,
      ...(hex ? { hex } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
  }
  return name;
}

function mergeColorImageUrls(snapshotColors = [], liveColors = []) {
  if (!Array.isArray(snapshotColors) || !snapshotColors.length) return snapshotColors;
  if (!Array.isArray(liveColors) || !liveColors.length) return snapshotColors;

  const liveByLabel = new Map();
  for (const color of liveColors) {
    const label = resolveCatalogColorLabel(color);
    if (label) liveByLabel.set(label, color);
  }

  return snapshotColors.map((color) => {
    const label = resolveCatalogColorLabel(color);
    const live = liveByLabel.get(label);
    if (!live) return color;

    const liveImageUrl = sanitizeImageUrlForCache(resolveCatalogColorImageUrl(live));
    if (!liveImageUrl) return color;

    if (typeof color === "string") {
      return { name: label, imageUrl: liveImageUrl };
    }
    if (!color || typeof color !== "object") return color;
    return { ...color, imageUrl: liveImageUrl };
  });
}

function truncateSnapshotDescription(description) {
  const text = String(description || "");
  if (text.length <= SNAPSHOT_DESCRIPTION_MAX_LENGTH) return text;
  return `${text.slice(0, SNAPSHOT_DESCRIPTION_MAX_LENGTH).trim()}…`;
}

export function resolveProductSizeOptions(product) {
  const sizes = product?.sizes;
  if (Array.isArray(sizes) && sizes.length) {
    return sizes.map((size) => String(size).trim()).filter(Boolean);
  }
  return DEFAULT_CATALOG_SIZES;
}

export function resolveCatalogRecipientEmail(selection, liveSettings) {
  const liveEmail = normalizeCatalogRecipientEmail(
    liveSettings?.companyEmail || liveSettings?.email
  );
  if (liveEmail) return liveEmail;

  const snapshotEmail = normalizeCatalogRecipientEmail(
    selection?.settings?.companyEmail ||
      selection?.settings?.email ||
      selection?.companyEmail
  );
  if (snapshotEmail) return snapshotEmail;

  return DEFAULT_CATALOG_RECIPIENT_EMAIL;
}

export function resolveProductMinQuantity(product) {
  const min = Number(product?.minOrderQty);
  return Number.isFinite(min) && min > 0 ? min : 1;
}

export function buildProductSnapshots(products = []) {
  return (products || [])
    .filter(Boolean)
    .map((product) => ({
      id: product.id,
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      price: Number(product.price) || 0,
      imageUrl: sanitizeImageUrlForCache(product.imageUrl),
      description: truncateSnapshotDescription(product.description),
      colors: (Array.isArray(product.colors) ? product.colors : [])
        .map(sanitizeColorForSnapshot)
        .filter(Boolean),
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      minOrderQty: Number(product.minOrderQty) || 0,
    }));
}

export function compactSelectionForPublicCache(selection, { omitSnapshots = false } = {}) {
  if (!selection) return selection;

  if (omitSnapshots) {
    const { productSnapshots: _ignored, ...rest } = selection;
    return rest;
  }

  if (!Array.isArray(selection.productSnapshots)) return { ...selection };

  return {
    ...selection,
    productSnapshots: selection.productSnapshots.map((snapshot) => ({
      ...snapshot,
      imageUrl: sanitizeImageUrlForCache(snapshot.imageUrl),
      description: truncateSnapshotDescription(snapshot.description),
      colors: (Array.isArray(snapshot.colors) ? snapshot.colors : [])
        .map(sanitizeColorForSnapshot)
        .filter(Boolean),
    })),
  };
}

export function pruneOldPublicCatalogCaches(keepShareId, maxKeep = PUBLIC_CATALOG_CACHE_MAX_ENTRIES) {
  if (typeof localStorage === "undefined") return 0;

  const entries = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(PUBLIC_CATALOG_CACHE_PREFIX)) continue;

    const shareId = key.slice(PUBLIC_CATALOG_CACHE_PREFIX.length);
    let sortDate = "";
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      sortDate = parsed?.updatedAt || parsed?.createdAt || "";
    } catch {
      sortDate = "";
    }
    entries.push({ key, shareId, sortDate });
  }

  entries.sort((left, right) => right.sortDate.localeCompare(left.sortDate));

  const keepIds = new Set([keepShareId]);
  entries.forEach((entry) => {
    if (keepIds.size >= maxKeep) return;
    keepIds.add(entry.shareId);
  });

  let removed = 0;
  entries.forEach((entry) => {
    if (keepIds.has(entry.shareId)) return;
    localStorage.removeItem(entry.key);
    removed += 1;
  });

  return removed;
}

export function createCatalogSelectionPayload({
  title = "",
  products = [],
  clientId = "",
  clientName = "",
  message = "",
  settings = {},
}) {
  const shareId = generateShareId();
  const now = new Date().toISOString();
  const productSnapshots = buildProductSnapshots(products);

  return {
    id: shareId,
    shareId,
    title: String(title || "").trim() || "Sélection catalogue",
    clientId,
    clientName,
    message,
    productIds: productSnapshots.map((product) => product.id),
    productSnapshots,
    settings: {
      companyEmail:
        normalizeCatalogRecipientEmail(settings.companyEmail) ||
        DEFAULT_CATALOG_RECIPIENT_EMAIL,
      companyName: settings.companyName || "",
      companyPhone: settings.companyPhone || "",
      email:
        normalizeCatalogRecipientEmail(settings.email || settings.companyEmail) ||
        DEFAULT_CATALOG_RECIPIENT_EMAIL,
    },
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCatalogProductSheet({
  selection,
  lines = [],
  productsById,
  contact = {},
  includePrice = false,
}) {
  const title = selection?.title || "Catalogue";
  const parts = [
    `FICHE PRODUIT — ${title}`,
    `Date : ${new Date().toLocaleDateString("fr-FR")}`,
  ];

  if (contact.clientName) parts.push(`Client : ${contact.clientName}`);
  if (contact.clientEmail) parts.push(`Email : ${contact.clientEmail}`);
  if (contact.clientPhone) parts.push(`Téléphone : ${contact.clientPhone}`);

  parts.push("", "Articles sélectionnés :", "");

  lines.forEach((line, index) => {
    const product = productsById.get(line.productId);
    const name = product?.name || "Article";
    const sku = product?.sku ? `SKU ${product.sku}` : "";
    const rawDesc = product?.description
      ? stripSourceFromDescription(product.description).split("\n")[0]
      : "";
    const desc =
      rawDesc.length > 120 ? `${rawDesc.slice(0, 120).trim()}…` : rawDesc;

    parts.push(`${index + 1}. ${name}${sku ? ` (${sku})` : ""}`);
    parts.push(`   Couleur : ${line.color || "—"}`);
    parts.push(`   Taille : ${line.size || "—"}`);
    parts.push(`   Quantité : ${Number(line.quantity) || 1}`);
    if (desc) parts.push(`   ${desc}`);
    if (includePrice && product?.price) {
      parts.push(`   Prix unitaire : ${Number(product.price).toFixed(2)} €`);
    }
    parts.push("");
  });

  if (contact.notes) {
    parts.push("Commentaire client :", contact.notes, "");
  }

  parts.push("—", "AC Creation");
  return parts.join("\n");
}

export function buildCatalogMailtoUrl({ recipientEmail, selection, bodyText }) {
  const subject = `Demande catalogue - ${selection?.title || "Sélection"}`;
  const to = String(recipientEmail || "").trim();
  const query = [
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(bodyText || "")}`,
  ].join("&");
  return to ? `mailto:${encodeURIComponent(to)}?${query}` : `mailto:?${query}`;
}

/** Prefer live catalog imageUrl over frozen selection snapshots. */
export function mergeLiveCatalogImages(products = [], liveItems = []) {
  if (!products.length) return [];
  const liveById = new Map(
    (liveItems || []).filter((item) => item?.id).map((item) => [item.id, item])
  );

  return products.map((product) => {
    const live = liveById.get(product.id);
    if (!live) return product;

    let merged = product;
    if (live.imageUrl) {
      merged = { ...merged, imageUrl: live.imageUrl };
    }
    if (live.colors?.length) {
      merged = {
        ...merged,
        colors: mergeColorImageUrls(merged.colors, live.colors),
      };
    }
    return merged;
  });
}

export function savePublicCatalogCache(selection, options = {}) {
  const { omitSnapshots = false, maxKeep = PUBLIC_CATALOG_CACHE_MAX_ENTRIES } = options;

  if (typeof window === "undefined" || !selection?.id) {
    return { ok: false, skipped: true };
  }

  const shareId = selection.shareId || selection.id;
  pruneOldPublicCatalogCaches(shareId, maxKeep);

  const key = `${PUBLIC_CATALOG_CACHE_PREFIX}${shareId}`;
  const attempts = [
    compactSelectionForPublicCache(selection, { omitSnapshots }),
    ...(omitSnapshots ? [] : [compactSelectionForPublicCache(selection, { omitSnapshots: true })]),
  ];

  let lastError = null;
  for (const payload of attempts) {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      return {
        ok: true,
        minimized: payload !== attempts[0],
      };
    } catch (error) {
      lastError = error;
    }
  }

  return { ok: false, error: lastError };
}

export function loadPublicCatalogCache(shareId) {
  if (typeof window === "undefined" || !shareId) return null;
  try {
    const raw = localStorage.getItem(`${PUBLIC_CATALOG_CACHE_PREFIX}${shareId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function generateShareId(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

export function getCatalogShareUrl(shareId) {
  const path = `${PUBLIC_CATALOG_PATH}/${shareId}`;
  if (typeof window === "undefined") return path;
  if (isHashRouterMode()) {
    return `${window.location.origin}${window.location.pathname}#${path}`;
  }
  return `${window.location.origin}${path}`;
}

export function buildCatalogQuoteDraft(selection, productsById) {
  const choices = selection?.clientSubmission?.choices || [];
  const lines = choices.map((choice) => {
    const product = productsById.get(choice.productId);
    const details = [choice.color, choice.size].filter(Boolean).join(" · ");
    const description = details
      ? `${product?.name || "Produit"} (${details})`
      : product?.name || "Produit";

    return {
      productId: choice.productId,
      sku: product?.sku || "",
      category: product?.category || "",
      description,
      quantity: Number(choice.quantity) || 1,
      price: Number(product?.price) || 0,
      discount: 0,
    };
  });

  return {
    clientId: selection.clientId || "",
    lines,
    source: "catalogue client",
    notes: [
      selection.title ? `Sélection : ${selection.title}` : "",
      selection.clientSubmission?.notes || "",
      selection.clientSubmission?.clientName
        ? `Contact : ${selection.clientSubmission.clientName}`
        : "",
      selection.clientSubmission?.clientEmail
        ? `Email : ${selection.clientSubmission.clientEmail}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function openQuoteFromCatalogSelection(navigate, selection, products) {
  const productsById = new Map((products || []).map((product) => [product.id, product]));
  const draft = buildCatalogQuoteDraft(selection, productsById);
  openQuoteFromCalculator(navigate, draft);
}

export function catalogSelectionPath(shareId) {
  return `${PUBLIC_CATALOG_PATH}/${shareId}`;
}

export function pageToPathWithCatalog(page) {
  if (page === "catalogueClient") return "/catalogue-client";
  if (page === "catalogSelections") return "/catalogue-client";
  return pageToPath(page);
}
