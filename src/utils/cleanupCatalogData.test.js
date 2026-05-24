import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  applyCatalogCleanupIfNeeded,
  buildCatalogSkuSet,
  cleanupCatalogData,
  filterCatalogSourcedProducts,
  isCatalogSourcedProduct,
  CLEANUP_FLAG_KEY,
} from "./cleanupCatalogData.js";

function createStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("cleanupCatalogData", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detecte un produit importe depuis La Maison du Tee-shirt", () => {
    expect(
      isCatalogSourcedProduct({
        name: "Sol's Regent",
        sku: "SO-11380",
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
        sourceProvider: "lamaisonduteeshirt",
      })
    ).toBe(true);
  });

  it("conserve un produit interne classique", () => {
    expect(
      isCatalogSourcedProduct({
        name: "Mug personnalise",
        sku: "MUG-001",
        price: 12.5,
        stock: 20,
      })
    ).toBe(false);
  });

  it("retire les produits catalogue et vide les collections catalogues", () => {
    const input = {
      products: [
        { id: "p1", name: "Mug", sku: "MUG-001" },
        {
          id: "p2",
          name: "Sol's Regent",
          sku: "SO-11380",
          sourceProvider: "lamaisonduteeshirt",
        },
      ],
      clientCatalogItems: [{ id: "c1", sku: "SO-11380", name: "Sol's Regent" }],
      supplierCatalogItems: [{ id: "s1", sku: "SO-9999" }],
      catalogSelections: [{ id: "sel1", title: "Selection client" }],
    };

    const { data, stats } = cleanupCatalogData(input);

    expect(data.products).toHaveLength(1);
    expect(data.products[0].sku).toBe("MUG-001");
    expect(data.clientCatalogItems).toEqual([]);
    expect(data.supplierCatalogItems).toEqual([]);
    expect(data.catalogSelections).toEqual([]);
    expect(stats.removedProducts).toBe(1);
    expect(stats.removedCatalogItems).toBe(2);
    expect(stats.removedCatalogSelections).toBe(1);
  });

  it("retire aussi les produits dont le SKU existe dans clientCatalogItems", () => {
    const catalogSkus = buildCatalogSkuSet([], [{ sku: "SO-11380" }]);
    const kept = filterCatalogSourcedProducts(
      [{ id: "p1", name: "Doublon", sku: "SO-11380" }],
      catalogSkus
    );
    expect(kept).toHaveLength(0);
  });

  it("conserve le catalogue apres la migration initiale", () => {
    localStorage.setItem(CLEANUP_FLAG_KEY, new Date().toISOString());

    const { data, applied } = applyCatalogCleanupIfNeeded({
      products: [{ id: "p1", name: "Mug", sku: "MUG-001" }],
      clientCatalogItems: [{ id: "c1", sku: "SO-11380" }],
      catalogSelections: [{ id: "s1" }],
    });

    expect(applied).toBe(false);
    expect(data.clientCatalogItems).toHaveLength(1);
    expect(data.catalogSelections).toHaveLength(1);
    expect(data.products).toHaveLength(1);
  });

  it("n'execute la migration initiale qu'une seule fois", () => {
    const input = {
      products: [{ id: "p1", sourceProvider: "lamaisonduteeshirt" }],
      clientCatalogItems: [{ id: "c1" }],
      catalogSelections: [{ id: "s1" }],
    };

    const first = applyCatalogCleanupIfNeeded(input);
    const second = applyCatalogCleanupIfNeeded({
      ...input,
      clientCatalogItems: [{ id: "c2" }],
    });

    expect(first.applied).toBe(true);
    expect(first.data.products).toHaveLength(0);
    expect(localStorage.getItem(CLEANUP_FLAG_KEY)).toBeTruthy();
    expect(second.applied).toBe(false);
    expect(second.data.clientCatalogItems).toHaveLength(1);
    expect(second.data.clientCatalogItems[0].id).toBe("c2");
    expect(second.data.products).toHaveLength(1);
  });
});
