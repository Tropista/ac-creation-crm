import { describe, expect, it, vi } from "vitest";
import { emptyData, flushSaveData, saveData, STORAGE_KEY } from "./dataService.js";
import { importScrapedCatalogItems } from "../utils/lmdtImport.js";
import { logActivity } from "./logService.js";

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

describe("logActivity", () => {
  it("n'écrase pas supplierCatalogItems quand localStorage est en retard sur l'état mémoire", async () => {
    vi.stubGlobal("localStorage", createStorage());
    saveData(emptyData);
    flushSaveData();

    const scraped = [
      {
        name: "Sol's Regent",
        sku: "SO-11380",
        category: "Tee-shirts",
        priceHT: 1.77,
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      },
    ];

    let memory = emptyData;
    const setData = vi.fn(async (next) => {
      memory = typeof next === "function" ? next(memory) : next;
    });

    const { nextData } = importScrapedCatalogItems(memory, scraped);
    await setData(nextData);

    await logActivity({
      action: "Import fournisseur",
      target: "https://example.com",
      details: "1 créé(s), 0 mis à jour",
      setData,
    });

    expect(memory.supplierCatalogItems).toHaveLength(1);
    expect(memory.supplierCatalogItems[0].sku).toBe("SO-11380");
    expect(memory.logs).toHaveLength(1);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.supplierCatalogItems || []).toHaveLength(0);

    vi.unstubAllGlobals();
  });
});
