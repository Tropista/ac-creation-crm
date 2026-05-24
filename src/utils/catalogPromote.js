import { mapScrapedToCatalogItem } from "./lmdtImport";

function supplierItemAsScraped(item) {
  return {
    name: item.name,
    sku: item.sku,
    category: item.category,
    priceHT: item.price,
    priceTTC: item.priceTTC,
    imageUrl: item.imageUrl,
    sourceUrl: item.sourceUrl,
    sourceProvider: item.sourceProvider,
    brand: item.brand,
    colors: item.colors,
    grammage: item.grammage,
    minOrderQty: item.minOrderQty,
    colorCount: item.colors?.length || 0,
  };
}

export function promoteSupplierItemsToCollection(
  data,
  itemIds = [],
  targetCollectionKey
) {
  const supplierItems = data.supplierCatalogItems || [];
  const targetItems = [...(data[targetCollectionKey] || [])];
  let created = 0;
  let updated = 0;

  for (const itemId of itemIds) {
    const source = supplierItems.find((entry) => entry.id === itemId);
    if (!source) continue;

    const mapped = mapScrapedToCatalogItem(
      supplierItemAsScraped(source),
      targetItems
    );
    const promoted = {
      ...mapped.item,
      supplierItemId: source.id,
    };

    if (mapped.action === "update") {
      updated += 1;
      const index = targetItems.findIndex((entry) => entry.id === promoted.id);
      targetItems[index] = promoted;
    } else {
      created += 1;
      targetItems.push(promoted);
    }
  }

  return {
    nextData: {
      ...data,
      [targetCollectionKey]: targetItems,
    },
    created,
    updated,
  };
}
