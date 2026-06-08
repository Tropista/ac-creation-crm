import { uid, today } from "./documents";

/** Noms de catégorie reconnus comme consommables (encre DTF, films, vinyle…). */
export const CONSUMABLE_CATEGORY_NAMES = ["consommable", "consommables"];

export const PRODUCTS_STOCK_FILTER_KEY = "crm_products_stock_filter";
export const PRODUCTS_KIND_FILTER_KEY = "crm_products_kind_filter";

export function isConsumableProduct(product, settings = {}) {
  if (!product || product.archived) return false;

  const trackedIds = settings.consumablesStock || [];
  if (
    trackedIds.some((id) => String(id) === String(product.id))
  ) {
    return true;
  }

  const category = String(product.category || "").trim().toLowerCase();
  return CONSUMABLE_CATEGORY_NAMES.includes(category);
}

export function isBlankProduct(product, settings = {}) {
  return !isConsumableProduct(product, settings);
}

export function filterProductsByStockKind(products = [], kind = "all", settings = {}) {
  if (kind === "consumable") {
    return products.filter((product) => isConsumableProduct(product, settings));
  }
  if (kind === "blank") {
    return products.filter((product) => isBlankProduct(product, settings));
  }
  return products;
}

export function getMinStock(product) {
  return Number(product?.stockMin || product?.minStock || 0);
}

export function getStock(product) {
  return Number(product?.stock || 0);
}

export function isLowStock(product) {
  if (product?.archived) return false;
  const stock = getStock(product);
  const minStock = getMinStock(product);
  return stock > 0 && minStock > 0 && stock <= minStock;
}

export function isOutOfStock(product) {
  return !product?.archived && getStock(product) <= 0;
}

export function countLowStockProducts(products = []) {
  return products.filter(isLowStock).length;
}

export function countLowStockByKind(products = [], kind = "all", settings = {}) {
  return filterProductsByStockKind(products, kind, settings).filter(isLowStock)
    .length;
}

export function getLowStockProducts(products = [], limit = 8) {
  return products
    .filter(isLowStock)
    .sort((a, b) => getStock(a) - getStock(b))
    .slice(0, limit);
}

export function getLowStockProductsByKind(
  products = [],
  kind = "all",
  limit = 8,
  settings = {}
) {
  return filterProductsByStockKind(products, kind, settings)
    .filter(isLowStock)
    .sort((a, b) => getStock(a) - getStock(b))
    .slice(0, limit);
}

/** Résout le fournisseur d'un produit (nom texte ou lien catalogue). */
export function resolveProductSupplier(product, suppliers = []) {
  if (!product) return null;

  const supplierName = String(product.supplier || "").trim().toLowerCase();
  if (supplierName) {
    const byName = suppliers.find(
      (entry) => String(entry.name || "").trim().toLowerCase() === supplierName
    );
    if (byName) return byName;
  }

  return (
    suppliers.find((entry) =>
      (entry.productLinks || []).some(
        (link) => String(link.productId) === String(product.id)
      )
    ) || null
  );
}

/** Quantité suggérée pour réassort (écart jusqu'au double du seuil min). */
export function suggestedReorderQty(product) {
  const stock = getStock(product);
  const minStock = getMinStock(product);
  if (minStock <= 0) return 1;
  return Math.max(1, minStock * 2 - stock);
}

function movementAction(type, quantityDelta) {
  const isIn = quantityDelta >= 0;
  switch (type) {
    case "scan":
      return isIn ? "Entrée stock (scan)" : "Sortie stock (scan)";
    case "invoice":
      return isIn ? "Retour stock (facture)" : "Sortie stock (facture)";
    case "bulk":
      return "Modification groupée";
    case "set":
      return "Correction inventaire";
    case "sale":
      return "Sortie stock (vente)";
    default:
      return isIn ? "Entrée stock" : "Sortie stock";
  }
}

export function createStockMovement({
  type = "adjustment",
  quantityDelta,
  previousStock,
  nextStock,
  reason = "",
  reference = "",
  user = "",
}) {
  return {
    id: uid(),
    date: today(),
    type,
    action: movementAction(type, quantityDelta),
    quantity: Math.abs(Number(quantityDelta || 0)),
    previousStock,
    nextStock,
    reason: reason || reference || "",
    reference,
    user,
  };
}

export function applyProductStockChange(product, quantityDelta, options = {}) {
  if (!product) return product;

  const previousStock = getStock(product);
  let nextStock;
  let actualDelta;

  if (options.setTo !== undefined && options.setTo !== null) {
    nextStock = Math.max(0, Number(options.setTo));
    actualDelta = nextStock - previousStock;
  } else {
    actualDelta = Number(quantityDelta || 0);
    if (!actualDelta) return product;
    nextStock = Math.max(0, previousStock + actualDelta);
  }

  if (actualDelta === 0) return product;

  const movement = createStockMovement({
    type: options.type || "adjustment",
    quantityDelta: actualDelta,
    previousStock,
    nextStock,
    reason: options.reason || "",
    reference: options.reference || "",
    user: options.user || "",
  });

  return {
    ...product,
    stock: nextStock,
    updatedAt: today(),
    stockMovements: [...(product.stockMovements || []), movement],
  };
}

export function applyStockByLines(products, lines, direction, options = {}) {
  const multiplier = direction === "remove" ? -1 : 1;

  return (products || []).map((product) => {
    const lineQty = (lines || [])
      .filter((line) => String(line.productId || "") === String(product.id))
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);

    if (!lineQty) return product;

    return applyProductStockChange(product, multiplier * lineQty, {
      type: options.type || "invoice",
      reason:
        options.reason ||
        (direction === "remove" ? "Vente facture" : "Restitution stock facture"),
      reference: options.reference || "",
      user: options.user || "",
    });
  });
}

const QUOTE_PRODUCTION_STOCK_STATUSES = ["En production", "Prêt", "Livré"];
const QUOTE_RESERVED_STOCK_STATUSES = ["Accepté", "En production", "Prêt"];

export function shouldAdjustQuoteProductionStock(status) {
  return QUOTE_PRODUCTION_STOCK_STATUSES.includes(String(status || "").trim());
}

export function syncQuoteProductionStock(products, previousQuote, nextQuote, options = {}) {
  let nextProducts = [...(products || [])];
  const wasStocked = Boolean(previousQuote?.productionStockAdjusted);
  const shouldStock = shouldAdjustQuoteProductionStock(nextQuote?.status);

  if (wasStocked && !shouldStock) {
    nextProducts = applyStockByLines(nextProducts, previousQuote?.lines || [], "add", {
      type: "production",
      reason: "Restitution stock (production annulée)",
      reference: previousQuote?.number || "",
      user: options.user || "",
    });
  }

  if (shouldStock && !wasStocked) {
    nextProducts = applyStockByLines(nextProducts, nextQuote?.lines || [], "remove", {
      type: "production",
      reason: "Sortie stock (mise en production)",
      reference: nextQuote?.number || "",
      user: options.user || "",
    });
  }

  return {
    products: nextProducts,
    productionStockAdjusted: shouldStock,
  };
}

export function syncDocumentStock(products, previousDoc, nextDoc, options = {}) {
  let nextProducts = [...(products || [])];
  const previousWasStocked = Boolean(previousDoc?.stockAdjusted);
  const nextShouldBeStocked =
    options.isQuote !== true && nextDoc?.status !== "Annulée";

  if (previousWasStocked) {
    nextProducts = applyStockByLines(nextProducts, previousDoc?.lines || [], "add", {
      type: "invoice",
      reason: "Modification facture — restitution stock",
      reference: previousDoc?.number || "",
      user: options.user || "",
    });
  }

  if (nextShouldBeStocked) {
    nextProducts = applyStockByLines(nextProducts, nextDoc?.lines || [], "remove", {
      type: "invoice",
      reason: "Vente facture",
      reference: nextDoc?.number || "",
      user: options.user || "",
    });
  }

  return nextProducts;
}

export function getReservedProductQuantities(quotes = []) {
  const map = new Map();

  for (const quote of quotes || []) {
    if (!QUOTE_RESERVED_STOCK_STATUSES.includes(String(quote?.status || "").trim())) {
      continue;
    }

    for (const line of quote.lines || []) {
      if (!line.productId) continue;
      const productId = String(line.productId);
      const current = map.get(productId) || {
        productId,
        quantity: 0,
        quotes: [],
      };

      current.quantity += Number(line.quantity || 0);
      if (!current.quotes.some((entry) => String(entry.id) === String(quote.id))) {
        current.quotes.push({
          id: quote.id,
          number: quote.number || quote.reference || "",
          status: quote.status || "",
          promisedDeliveryDate: quote.promisedDeliveryDate || "",
        });
      }
      map.set(productId, current);
    }
  }

  return map;
}

export function buildAdvancedStockRows(products = [], quotes = [], suppliers = [], settings = {}) {
  const reservedMap = getReservedProductQuantities(quotes);

  return (products || [])
    .filter((product) => !product?.archived)
    .map((product) => {
      const reserved = reservedMap.get(String(product.id));
      const stock = getStock(product);
      const reservedQty = Math.round(Number(reserved?.quantity || 0) * 100) / 100;
      const availableStock = Math.round((stock - reservedQty) * 100) / 100;
      const minStock = getMinStock(product);
      const supplier = resolveProductSupplier(product, suppliers);
      const reorderQty =
        minStock > 0 ? Math.max(0, Math.ceil(minStock * 2 - availableStock)) : 0;

      return {
        product,
        productId: product.id,
        name: product.name || product.sku || "Produit",
        sku: product.sku || "",
        stock,
        reservedQty,
        availableStock,
        minStock,
        supplier,
        supplierId: supplier?.id || "",
        supplierName: supplier?.name || product.supplier || "Sans fournisseur",
        reorderQty,
        lowStock: availableStock > 0 && minStock > 0 && availableStock <= minStock,
        outOfStock: availableStock <= 0,
        isConsumable: isConsumableProduct(product, settings),
        reservations: reserved?.quotes || [],
      };
    })
    .sort((a, b) => {
      if (a.outOfStock !== b.outOfStock) return a.outOfStock ? -1 : 1;
      if (a.lowStock !== b.lowStock) return a.lowStock ? -1 : 1;
      return a.availableStock - b.availableStock;
    });
}

export function buildSupplierReorderGroups(products = [], suppliers = [], quotes = [], settings = {}) {
  const rows = buildAdvancedStockRows(products, quotes, suppliers, settings).filter(
    (row) => row.minStock > 0 && row.reorderQty > 0
  );
  const groups = new Map();

  for (const row of rows) {
    const key = row.supplierId || row.supplierName || "unknown";
    const current = groups.get(key) || {
      supplier: row.supplier || null,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      supplierEmail: row.supplier?.email || "",
      lines: [],
      totalSuggestedQty: 0,
    };
    current.lines.push({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      stock: row.stock,
      reservedQty: row.reservedQty,
      availableStock: row.availableStock,
      minStock: row.minStock,
      quantity: row.reorderQty,
    });
    current.totalSuggestedQty += row.reorderQty;
    groups.set(key, current);
  }

  return [...groups.values()].sort((a, b) =>
    String(a.supplierName).localeCompare(String(b.supplierName))
  );
}

export function createSupplierPurchaseOrderDraft(group = {}, settings = {}) {
  const company = settings.companyName || "AC Creation";
  const supplierName = group.supplierName || "Fournisseur";
  const lines = group.lines || [];

  return {
    supplierName,
    supplierEmail: group.supplierEmail || "",
    subject: `Commande fournisseur - ${company}`,
    body: [
      `Bonjour ${supplierName},`,
      "",
      "Pouvez-vous nous préparer la commande suivante ?",
      "",
      ...lines.map(
        (line) =>
          `- ${line.quantity} x ${line.sku ? `${line.sku} - ` : ""}${line.name}`
      ),
      "",
      "Merci d'avance.",
      company,
    ].join("\n"),
  };
}
