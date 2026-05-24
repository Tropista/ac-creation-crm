import { describe, expect, it } from "vitest";
import {
  importScrapedCatalogItems,
  importScrapedToCollection,
  mapScrapedToCatalogItem,
  patchClientCatalogColors,
} from "./lmdtImport.js";
import { CLIENT_CATALOG_KEY } from "./catalogCollections.js";

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
      colors: [
        { name: "Blanc", hex: "#ffffff" },
        { name: "Noir Profond", hex: "#0d0d0d" },
      ],
    });
    expect(mapped.item.description).not.toMatch(/source\s*:/i);
    expect(mapped.item.description).toContain("44 coloris disponibles");
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

  it("updates existing client catalog imageUrl on re-import by SKU", () => {
    const existingItem = {
      id: "existing-1",
      sku: "SO-11380",
      name: "Sol's Regent",
      imageUrl: "https://example.com/old-model.jpg",
      sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const newPackshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzgwLndlYnA";

    const { nextData, created, updated } = importScrapedToCollection(
      { clientCatalogItems: [existingItem] },
      [
        {
          name: "Sol's Regent",
          sku: "SO-11380",
          category: "Tee-shirts",
          priceHT: 1.77,
          imageUrl: newPackshot,
          sourceUrl: existingItem.sourceUrl,
        },
      ],
      CLIENT_CATALOG_KEY
    );

    expect(created).toBe(0);
    expect(updated).toBe(1);
    expect(nextData.clientCatalogItems).toHaveLength(1);
    expect(nextData.clientCatalogItems[0].imageUrl).toBe(newPackshot);
    expect(nextData.clientCatalogItems[0].id).toBe("existing-1");
  });

  it("refreshes productSnapshots on client catalog re-import", () => {
    const existingItem = {
      id: "existing-1",
      sku: "SO-11380",
      name: "Sol's Regent",
      imageUrl: "https://example.com/old-model.jpg",
      sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const newPackshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzgwLndlYnA";

    const { nextData } = importScrapedToCollection(
      {
        clientCatalogItems: [existingItem],
        catalogSelections: [
          {
            id: "sel-1",
            productIds: ["existing-1"],
            productSnapshots: [
              {
                id: "existing-1",
                name: "Sol's Regent",
                sku: "SO-11380",
                imageUrl: "https://example.com/old-model.jpg",
              },
            ],
          },
        ],
      },
      [
        {
          name: "Sol's Regent",
          sku: "SO-11380",
          category: "Tee-shirts",
          priceHT: 1.77,
          imageUrl: newPackshot,
          sourceUrl: existingItem.sourceUrl,
        },
      ],
      CLIENT_CATALOG_KEY
    );

    expect(nextData.catalogSelections[0].productSnapshots[0].imageUrl).toBe(newPackshot);
  });

  it("keeps existing packshot when scraped import still carries a model URL", () => {
    const existingPackshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzgwLndlYnA";
    const modelShot =
      "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzUvMTc1LTE5OS0xLmpwZw";

    const { nextData } = importScrapedToCollection(
      {
        clientCatalogItems: [
          {
            id: "existing-1",
            sku: "GI-5000",
            imageUrl: existingPackshot,
            sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/gi-5000/heavy-cotton",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      [
        {
          name: "Gildan Heavy Cotton",
          sku: "GI-5000",
          category: "Tee-shirts",
          priceHT: 2.5,
          imageUrl: modelShot,
          sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/gi-5000/heavy-cotton",
        },
      ],
      CLIENT_CATALOG_KEY
    );

    expect(nextData.clientCatalogItems[0].imageUrl).toBe(existingPackshot);
  });

  it("drops stale model image when re-import has no packshot yet", () => {
    const modelShot =
      "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzUvMTc1LTE5OS0xLmpwZw";

    const { nextData } = importScrapedToCollection(
      {
        clientCatalogItems: [
          {
            id: "existing-1",
            sku: "GI-5000",
            imageUrl: modelShot,
            sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/gi-5000/heavy-cotton",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      [
        {
          name: "Gildan Heavy Cotton",
          sku: "GI-5000",
          category: "Tee-shirts",
          priceHT: 2.5,
          imageUrl: "",
          sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/gi-5000/heavy-cotton",
        },
      ],
      CLIENT_CATALOG_KEY
    );

    expect(nextData.clientCatalogItems[0].imageUrl).toBe("");
  });

  it("patchClientCatalogColors persists imageUrl per color from refresh", () => {
    const colorImage =
      "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzgwLzE3ODAtMzEwNC0xLndlYnA";
    const sourceUrl =
      "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent";
    const { nextData, updated } = patchClientCatalogColors(
      {
        clientCatalogItems: [
          {
            id: "item-1",
            sku: "SO-11380",
            sourceUrl,
            colors: [{ name: "Blanc", hex: "#ffffff" }],
          },
        ],
      },
      new Map([
        [
          sourceUrl.toLowerCase(),
          [{ name: "blanc", hex: "#ffffff", imageUrl: colorImage }],
        ],
      ])
    );

    expect(updated).toBe(1);
    expect(nextData.clientCatalogItems[0].colors[0]).toMatchObject({
      name: "Blanc",
      hex: "#ffffff",
      imageUrl: colorImage,
    });
  });
});
