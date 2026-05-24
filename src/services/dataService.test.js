import { describe, expect, it, vi } from "vitest";
import { emptyData, hasLocalBusinessData, saveData, loadData, flushSaveData, STORAGE_KEY, normalizeData } from "./dataService.js";
import { stampDataChanges } from "./syncMerge.js";
import { importScrapedCatalogItems } from "../utils/lmdtImport.js";

function createStorage() {
  const store = new Map();
  return {
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

describe("dataService", () => {
  it("hasLocalBusinessData inclut les collections catalogues", () => {
    expect(hasLocalBusinessData(emptyData)).toBe(false);
    expect(
      hasLocalBusinessData({
        ...emptyData,
        supplierCatalogItems: [{ id: "c1", name: "Tee-shirt" }],
      })
    ).toBe(true);
    expect(
      hasLocalBusinessData({
        ...emptyData,
        clientCatalogItems: [{ id: "c2", name: "Polo" }],
      })
    ).toBe(true);
    expect(
      hasLocalBusinessData({
        ...emptyData,
        catalogSelections: [{ id: "s1", title: "Sélection" }],
      })
    ).toBe(true);
  });

  it("saveData et loadData conservent supplierCatalogItems", () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);

    const payload = {
      ...emptyData,
      supplierCatalogItems: [{ id: "c1", name: "Sol's Regent", sku: "SO-11380" }],
    };
    saveData(payload);
    flushSaveData();

    const loaded = loadData();
    expect(loaded.supplierCatalogItems).toHaveLength(1);
    expect(loaded.supplierCatalogItems[0].name).toBe("Sol's Regent");

    vi.unstubAllGlobals();
  });

  it("migre catalogItems legacy vers clientCatalogItems", () => {
    const loaded = normalizeData({
      catalogItems: [{ id: "legacy-1", name: "Ancien article" }],
    });
    expect(loaded.clientCatalogItems).toHaveLength(1);
    expect(loaded.clientCatalogItems[0].name).toBe("Ancien article");
    expect(loaded.catalogItems).toHaveLength(0);
  });
});

describe("catalog import persistence", () => {
  it("import puis journal ne doit pas effacer supplierCatalogItems", () => {
    const scraped = [
      {
        name: "Sol's Regent",
        sku: "SO-11380",
        category: "Tee-shirts",
        priceHT: 1.77,
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      },
    ];

    const { nextData } = importScrapedCatalogItems(emptyData, scraped);
    const afterImport = stampDataChanges(emptyData, nextData);

    const logUpdate = {
      ...afterImport,
      logs: [
        {
          id: "log-1",
          action: "Import fournisseur",
          target: "https://example.com",
          details: "1 créé(s), 0 mis à jour",
        },
      ],
    };

    const afterLog = stampDataChanges(afterImport, logUpdate);
    expect(afterLog.supplierCatalogItems).toHaveLength(1);
    expect(afterLog.supplierCatalogItems[0].sku).toBe("SO-11380");
    expect(afterLog.logs).toHaveLength(1);
  });
});
