import { describe, expect, it } from "vitest";
import { importScrapedCatalogItems, mapScrapedToCatalogItem } from "./lmdtImport.js";

describe("lmdtImport", () => {
  it("maps scraped item to catalog item shape", () => {
    const mapped = mapScrapedToCatalogItem({
      name: "Sol's Regent",
      sku: "SO-11380",
      category: "Tee-shirts",
      priceHT: 1.77,
      priceTTC: 2.12,
      imageUrl: "https://example.com/regent.webp",
      sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      sourceProvider: "lamaisonduteeshirt",
      colors: ["blanc", "noir profond"],
      grammage: "145g/m²",
      minOrderQty: 500,
      colorCount: 44,
    });

    expect(mapped.action).toBe("create");
    expect(mapped.item).toMatchObject({
      name: "Sol's Regent",
      sku: "SO-11380",
      category: "Tee-shirts",
      price: 1.77,
      sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
    });
    expect(mapped.item.stock).toBeUndefined();
  });

  it("imports into supplierCatalogItems without touching products or categories", () => {
    const { nextData, created, updated } = importScrapedCatalogItems(
      { products: [], categories: [], supplierCatalogItems: [] },
      [
        {
          name: "Sol's Regent",
          sku: "SO-11380",
          category: "Tee-shirts",
          priceHT: 1.77,
          sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
        },
      ]
    );

    expect(created).toBe(1);
    expect(updated).toBe(0);
    expect(nextData.supplierCatalogItems).toHaveLength(1);
    expect(nextData.products).toHaveLength(0);
    expect(nextData.categories).toHaveLength(0);
    expect(nextData.products).not.toContainEqual(expect.objectContaining({ sku: "SO-11380" }));
  });
});
