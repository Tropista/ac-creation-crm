import { isHashRouterMode, pageToPath } from "./routes";
import { openQuoteFromCalculator } from "./quoteDraft";

export const PUBLIC_CATALOG_PATH = "/catalogue";

export const PUBLIC_CATALOG_CACHE_PREFIX = "crm_catalog_public_";

export function buildProductSnapshots(products = []) {
  return (products || [])
    .filter(Boolean)
    .map((product) => ({
      id: product.id,
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      price: Number(product.price) || 0,
      imageUrl: product.imageUrl || "",
      description: product.description || "",
      colors: Array.isArray(product.colors) ? product.colors : [],
    }));
}

export function savePublicCatalogCache(selection) {
  if (typeof window === "undefined" || !selection?.id) return;
  localStorage.setItem(
    `${PUBLIC_CATALOG_CACHE_PREFIX}${selection.id}`,
    JSON.stringify(selection)
  );
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
