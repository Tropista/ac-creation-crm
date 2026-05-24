import { resolveCatalogImageUrl } from "./lmdtImages";
import { CLIENT_CATALOG_KEY, SUPPLIER_CATALOG_KEY } from "./catalogCollections";
import { stripSourceFromDescription } from "./catalogDescription";
import { enrichCatalogColors } from "./colorNameToHex";

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
  ].filter(Boolean);

  const payload = {
    name: scraped.name,
    sku: scraped.sku,
    category: scraped.category,
    price: Number(scraped.priceHT) || 0,
    imageUrl: scraped.imageUrl || "",
    description: stripSourceFromDescription(descriptionParts.join("\n")),
    sourceUrl: scraped.sourceUrl,
    sourceProvider: scraped.sourceProvider || "lamaisonduteeshirt",
    brand: scraped.brand || "",
    colors: enrichCatalogColors(scraped.colors || []),
    priceTTC: Number(scraped.priceTTC) || 0,
    grammage: scraped.grammage || "",
    minOrderQty: Number(scraped.minOrderQty) || 0,
    updatedAt: today(),
  };

  if (existing) {
    const nextImageUrl = resolveCatalogImageUrl(scraped.imageUrl, existing.imageUrl);
    return {
      action: "update",
      item: {
        ...existing,
        ...payload,
        imageUrl: nextImageUrl,
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

function refreshSelectionSnapshots(data, updatedItems = []) {
  if (!updatedItems.length || !data.catalogSelections?.length) return data;

  const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
  let changed = false;

  const catalogSelections = data.catalogSelections.map((selection) => {
    if (!selection?.productSnapshots?.length) return selection;

    let selectionChanged = false;
    const productSnapshots = selection.productSnapshots.map((snapshot) => {
      const fresh = updatedById.get(snapshot.id);
      if (!fresh?.imageUrl || fresh.imageUrl === snapshot.imageUrl) return snapshot;
      selectionChanged = true;
      return { ...snapshot, imageUrl: fresh.imageUrl };
    });

    if (!selectionChanged) return selection;
    changed = true;
    return {
      ...selection,
      productSnapshots,
      updatedAt: today(),
    };
  });

  if (!changed) return data;
  return { ...data, catalogSelections };
}

/** Apply imageUrl patches to client catalog items (and selection snapshots). */
export function patchClientCatalogImageUrls(data, imageBySourceUrl = new Map()) {
  if (!imageBySourceUrl.size) {
    return { nextData: data, updated: 0, touchedItems: [] };
  }

  const items = [...(data.clientCatalogItems || [])];
  const touchedItems = [];
  let updated = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = normalizeKey(item?.sourceUrl);
    const nextUrl = key ? imageBySourceUrl.get(key) : "";
    if (!nextUrl || nextUrl === item.imageUrl) continue;

    const patched = {
      ...item,
      imageUrl: nextUrl,
      updatedAt: today(),
    };
    items[index] = patched;
    touchedItems.push(patched);
    updated += 1;
  }

  if (!touchedItems.length) {
    return { nextData: data, updated: 0, touchedItems: [] };
  }

  const nextData = refreshSelectionSnapshots(
    {
      ...data,
      clientCatalogItems: items,
    },
    touchedItems
  );

  return { nextData, updated, touchedItems };
}

/** Apply color patches to client catalog items by sourceUrl. */
export function patchClientCatalogColors(data, colorsBySourceUrl = new Map()) {
  if (!colorsBySourceUrl.size) {
    return { nextData: data, updated: 0, touchedItems: [] };
  }

  const items = [...(data.clientCatalogItems || [])];
  const touchedItems = [];
  let updated = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = normalizeKey(item?.sourceUrl);
    const nextColors = key ? colorsBySourceUrl.get(key) : null;
    if (!nextColors?.length) continue;

    const patched = {
      ...item,
      colors: enrichCatalogColors(nextColors),
      updatedAt: today(),
    };
    items[index] = patched;
    touchedItems.push(patched);
    updated += 1;
  }

  if (!touchedItems.length) {
    return { nextData: data, updated: 0, touchedItems: [] };
  }

  const nextData = refreshSelectionSnapshots(
    {
      ...data,
      clientCatalogItems: items,
    },
    touchedItems
  );

  return { nextData, updated, touchedItems };
}

/** Import web vers une collection catalogue (jamais products[]). */
export function importScrapedToCollection(
  data,
  scrapedProducts = [],
  collectionKey = SUPPLIER_CATALOG_KEY
) {
  let created = 0;
  let updated = 0;
  const items = [...(data[collectionKey] || [])];
  const touchedItems = [];

  for (const scraped of scrapedProducts) {
    const mapped = mapScrapedToCatalogItem(scraped, items);
    if (mapped.action === "update") {
      updated += 1;
      const index = items.findIndex((item) => item.id === mapped.item.id);
      items[index] = mapped.item;
      touchedItems.push(mapped.item);
    } else {
      created += 1;
      items.push(mapped.item);
      touchedItems.push(mapped.item);
    }
  }

  const withSnapshots =
    collectionKey === CLIENT_CATALOG_KEY
      ? refreshSelectionSnapshots(
          {
            ...data,
            [collectionKey]: items,
          },
          touchedItems
        )
      : {
          ...data,
          [collectionKey]: items,
        };

  return {
    nextData: withSnapshots,
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
