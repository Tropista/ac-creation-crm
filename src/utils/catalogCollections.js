export const SUPPLIER_CATALOG_KEY = "supplierCatalogItems";
export const CLIENT_CATALOG_KEY = "clientCatalogItems";

export const CATALOG_COLLECTION_KEYS = [
  SUPPLIER_CATALOG_KEY,
  CLIENT_CATALOG_KEY,
];

export function resolveActiveCatalogItems(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => item && !item.archived);
}

export function migrateLegacyCatalogData(data = {}) {
  const legacy = Array.isArray(data.catalogItems) ? data.catalogItems : [];
  let supplierCatalogItems = Array.isArray(data.supplierCatalogItems)
    ? data.supplierCatalogItems
    : [];
  let clientCatalogItems = Array.isArray(data.clientCatalogItems)
    ? data.clientCatalogItems
    : [];

  if (legacy.length && clientCatalogItems.length === 0 && supplierCatalogItems.length === 0) {
    clientCatalogItems = legacy;
  }

  return {
    supplierCatalogItems,
    clientCatalogItems,
    catalogItems: [],
  };
}
