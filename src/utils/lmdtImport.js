function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}

function normalizeKey(value = "") {
  return String(value).trim().toLowerCase();
}

export function mapScrapedToCatalogItem(scraped, existingItems = []) {
  const existingBySku = new Map(
    (existingItems || [])
      .filter((item) => item?.sku)
      .map((item) => [normalizeKey(item.sku), item])
  );
  const existingByUrl = new Map(
    (existingItems || [])
      .filter((item) => item?.sourceUrl)
      .map((item) => [normalizeKey(item.sourceUrl), item])
  );

  const skuKey = normalizeKey(scraped.sku);
  const urlKey = normalizeKey(scraped.sourceUrl);
  const existing = existingBySku.get(skuKey) || existingByUrl.get(urlKey);

  const descriptionParts = [
    scraped.grammage ? `Grammage : ${scraped.grammage}` : "",
    scraped.minOrderQty ? `Commande min. : x${scraped.minOrderQty}` : "",
    scraped.colorCount ? `${scraped.colorCount} coloris disponibles` : "",
    scraped.colors?.length ? `Couleurs : ${scraped.colors.slice(0, 12).join(", ")}` : "",
    scraped.sourceUrl ? `Source : ${scraped.sourceUrl}` : "",
  ].filter(Boolean);

  const payload = {
    name: scraped.name,
    sku: scraped.sku,
    category: scraped.category,
    price: Number(scraped.priceHT) || 0,
    imageUrl: scraped.imageUrl || "",
    description: descriptionParts.join("\n"),
    sourceUrl: scraped.sourceUrl,
    sourceProvider: scraped.sourceProvider || "lamaisonduteeshirt",
    brand: scraped.brand || "",
    colors: scraped.colors || [],
    priceTTC: Number(scraped.priceTTC) || 0,
    grammage: scraped.grammage || "",
    minOrderQty: Number(scraped.minOrderQty) || 0,
    updatedAt: today(),
  };

  if (existing) {
    return {
      action: "update",
      item: {
        ...existing,
        ...payload,
        id: existing.id,
        createdAt: existing.createdAt || today(),
      },
    };
  }

  return {
    action: "create",
    item: {
      id: uid(),
      createdAt: today(),
      archived: false,
      ...payload,
    },
  };
}

import { SUPPLIER_CATALOG_KEY } from "./catalogCollections";

/** Import web vers une collection catalogue (jamais products[]). */
export function importScrapedToCollection(
  data,
  scrapedProducts = [],
  collectionKey = SUPPLIER_CATALOG_KEY
) {
  let created = 0;
  let updated = 0;
  const items = [...(data[collectionKey] || [])];

  for (const scraped of scrapedProducts) {
    const mapped = mapScrapedToCatalogItem(scraped, items);
    if (mapped.action === "update") {
      updated += 1;
      const index = items.findIndex((item) => item.id === mapped.item.id);
      items[index] = mapped.item;
    } else {
      created += 1;
      items.push(mapped.item);
    }
  }

  return {
    nextData: {
      ...data,
      [collectionKey]: items,
    },
    created,
    updated,
  };
}

/** Import web vers le pool fournisseur (staging). */
export function importScrapedCatalogItems(data, scrapedProducts = []) {
  return importScrapedToCollection(data, scrapedProducts, SUPPLIER_CATALOG_KEY);
}

/** @deprecated Utiliser importScrapedCatalogItems */
export function importScrapedProducts(data, scrapedProducts = []) {
  return importScrapedCatalogItems(data, scrapedProducts);
}

/** @deprecated Utiliser mapScrapedToCatalogItem */
export function mapScrapedProductToCrm(scraped, existingProducts = []) {
  const mapped = mapScrapedToCatalogItem(scraped, existingProducts);
  return {
    action: mapped.action,
    product: mapped.item,
  };
}
