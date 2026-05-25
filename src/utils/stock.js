import { uid, today } from "./documents";

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

export function getLowStockProducts(products = [], limit = 8) {
  return products
    .filter(isLowStock)
    .sort((a, b) => getStock(a) - getStock(b))
    .slice(0, limit);
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
