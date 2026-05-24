import { PUBLIC_CATALOG_CACHE_PREFIX } from "./catalogShare";

export const CLEANUP_FLAG_KEY = "crm_catalog_cleanup_v1";

const LMDT_DOMAIN = "lamaisonduteeshirt.com";
const CATALOG_PROVIDERS = new Set(["lamaisonduteeshirt", "lmdt", "catalog-import"]);

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

export function isCatalogSourcedProduct(product) {
  if (!product || typeof product !== "object") return false;

  const sourceProvider = normalizeText(product.sourceProvider);
  if (CATALOG_PROVIDERS.has(sourceProvider)) return true;

  const sourceUrl = normalizeText(product.sourceUrl);
  if (sourceUrl.includes(LMDT_DOMAIN)) return true;

  const description = normalizeText(product.description);
  if (description.includes(LMDT_DOMAIN)) return true;
  if (
    /source\s*:\s*https?:\/\//.test(description) &&
    /lamaisonduteeshirt|grammage|coloris disponibles/.test(description)
  ) {
    return true;
  }

  const supplier = normalizeText(product.supplier);
  if (/maison du tee|lmdt|la maison du t-shirt/.test(supplier)) return true;

  if (
    product.sourceUrl &&
    (product.priceTTC != null || product.grammage || product.minOrderQty != null)
  ) {
    return true;
  }

  if (
    product.grammage &&
    Array.isArray(product.colors) &&
    product.colors.length > 0 &&
    product.priceTTC != null
  ) {
    return true;
  }

  return false;
}

export function buildCatalogSkuSet(catalogItems = [], clientCatalogItems = []) {
  const items = [...catalogItems, ...clientCatalogItems];
  return new Set(
    items
      .map((item) => normalizeText(item?.sku))
      .filter(Boolean)
  );
}

export function filterCatalogSourcedProducts(products = [], catalogSkus = new Set()) {
  return (products || []).filter((product) => {
    if (isCatalogSourcedProduct(product)) return false;
    const sku = normalizeText(product?.sku);
    if (sku && catalogSkus.has(sku)) return false;
    return true;
  });
}

export function clearPublicCatalogCaches() {
  if (typeof localStorage === "undefined") return 0;

  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PUBLIC_CATALOG_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  return keysToRemove.length;
}

export function cleanupCatalogData(data = {}) {
  const legacyCatalogItems = Array.isArray(data.catalogItems) ? data.catalogItems : [];
  const clientCatalogItems = Array.isArray(data.clientCatalogItems) ? data.clientCatalogItems : [];
  const supplierCatalogItems = Array.isArray(data.supplierCatalogItems) ? data.supplierCatalogItems : [];
  const catalogSelections = Array.isArray(data.catalogSelections) ? data.catalogSelections : [];
  const catalogSkus = buildCatalogSkuSet(legacyCatalogItems, [
    ...clientCatalogItems,
    ...supplierCatalogItems,
  ]);
  const productsBefore = Array.isArray(data.products) ? data.products.length : 0;
  const cleanedProducts = filterCatalogSourcedProducts(data.products, catalogSkus);

  return {
    data: {
      ...data,
      catalogItems: [],
      supplierCatalogItems,
      clientCatalogItems,
      catalogSelections,
      products: cleanedProducts,
    },
    stats: {
      removedProducts: productsBefore - cleanedProducts.length,
      removedCatalogItems: legacyCatalogItems.length,
      removedCatalogSelections: 0,
      productsBefore,
      productsAfter: cleanedProducts.length,
      clearedPublicCaches: clearPublicCatalogCaches(),
    },
  };
}

export function applyCatalogCleanupIfNeeded(data = {}) {
  if (typeof localStorage !== "undefined" && localStorage.getItem(CLEANUP_FLAG_KEY)) {
    return {
      data,
      applied: false,
      stats: null,
    };
  }

  const result = cleanupCatalogData(data);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CLEANUP_FLAG_KEY, new Date().toISOString());
  }

  return {
    data: result.data,
    applied: true,
    stats: result.stats,
  };
}

export function finalizeDataWithCatalogCleanup(data, normalizeData) {
  const { data: cleaned, applied, stats } = applyCatalogCleanupIfNeeded(data);
  return {
    data: normalizeData(cleaned),
    applied,
    stats,
  };
}
