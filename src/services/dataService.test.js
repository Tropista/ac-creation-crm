import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase.js", () => ({
  isSupabaseConfigured: false,
}));

import {
  emptyData,
  getLocalCatalogMeta,
  hasLocalBusinessData,
  saveData,
  loadData,
  flushSaveData,
  STORAGE_KEY,
  LOCAL_CATALOG_META_KEY,
  normalizeData,
  prepareDataForLocalStorage,
  stripBase64FromCatalogItem,
  isQuotaExceededError,
} from "./dataService.js";
import { stampDataChanges } from "./syncMerge.js";
import { importScrapedCatalogItems } from "../utils/lmdtImport.js";

function createStorage({ quotaBytes = Infinity } = {}) {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (String(value).length > quotaBytes) {
        const error = new Error("Failed to execute 'setItem' on 'Storage'");
        error.name = "QuotaExceededError";
        error.code = 22;
        throw error;
      }
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("hasLocalBusinessData reconnaît les métadonnées catalogue exclues", () => {
    expect(
      hasLocalBusinessData({
        ...emptyData,
        [LOCAL_CATALOG_META_KEY]: { supplierCount: 6000, clientCount: 120 },
      })
    ).toBe(true);
  });

  it("saveData et loadData conservent supplierCatalogItems sans cloud", () => {
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
  });

  it("migre catalogItems legacy vers clientCatalogItems", () => {
    const loaded = normalizeData({
      catalogItems: [{ id: "legacy-1", name: "Ancien article" }],
    });
    expect(loaded.clientCatalogItems).toHaveLength(1);
    expect(loaded.clientCatalogItems[0].name).toBe("Ancien article");
    expect(loaded.catalogItems).toHaveLength(0);
  });

  it("stripBase64FromCatalogItem conserve les URLs http", () => {
    const item = stripBase64FromCatalogItem({
      id: "1",
      imageUrl: "https://example.com/img.jpg",
      colors: [{ name: "Blanc", imageUrl: "https://example.com/blanc.jpg" }],
    });
    expect(item.imageUrl).toBe("https://example.com/img.jpg");
    expect(item.colors[0].imageUrl).toBe("https://example.com/blanc.jpg");
  });

  it("stripBase64FromCatalogItem supprime les images base64", () => {
    const item = stripBase64FromCatalogItem({
      id: "1",
      imageUrl: "data:image/jpeg;base64,abc123",
      colors: [{ name: "Blanc", imageUrl: "data:image/jpeg;base64,xyz" }],
    });
    expect(item.imageUrl).toBe("");
    expect(item.colors[0].imageUrl).toBe("");
  });

  it("getLocalCatalogMeta lit les compteurs catalogue depuis le stockage brut", () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        clients: [{ id: "c1" }],
        [LOCAL_CATALOG_META_KEY]: {
          supplierCount: 6200,
          clientCount: 1440,
          excludedFromLocal: true,
        },
      })
    );

    const meta = getLocalCatalogMeta();
    expect(meta?.supplierCount).toBe(6200);
    expect(meta?.clientCount).toBe(1440);

    const loaded = loadData();
    expect(loaded.clientCatalogItems).toHaveLength(0);
    expect(hasLocalBusinessData(loaded)).toBe(true);
  });

  it("prepareDataForLocalStorage exclut les catalogues quand cloud activé", async () => {
    vi.doUnmock("../supabase.js");
    vi.resetModules();
    vi.doMock("../supabase.js", () => ({
      isSupabaseConfigured: true,
    }));

    const { prepareDataForLocalStorage: prepareWithCloud } = await import("./dataService.js");

    const payload = prepareWithCloud({
      ...emptyData,
      supplierCatalogItems: [{ id: "s1", name: "Pool" }],
      clientCatalogItems: [{ id: "c1", name: "Client" }],
      catalogSelections: [{ id: "sel1", title: "Sélection" }],
    });

    expect(payload.supplierCatalogItems).toHaveLength(0);
    expect(payload.clientCatalogItems).toHaveLength(0);
    expect(payload.catalogSelections).toHaveLength(0);
    expect(payload[LOCAL_CATALOG_META_KEY]).toMatchObject({
      supplierCount: 1,
      clientCount: 1,
      selectionsCount: 1,
      excludedFromLocal: true,
    });

    vi.doUnmock("../supabase.js");
    vi.resetModules();
  });

  it("flushSaveData récupère gracieusement après QuotaExceededError", () => {
    const storage = createStorage({ quotaBytes: 3000 });
    vi.stubGlobal("localStorage", storage);

    const payload = {
      ...emptyData,
      clients: [{ id: "cl1", name: "Client test" }],
      supplierCatalogItems: Array.from({ length: 80 }, (_, index) => ({
        id: `item-${index}`,
        name: `Article catalogue numéro ${index}`,
        sku: `SKU-${index}`,
        description: "Description longue pour gonfler le cache local ".repeat(3),
      })),
    };

    saveData(payload);
    const result = flushSaveData();

    expect(result?.ok).toBe(true);
    expect(result?.quotaExceeded).toBe(true);
    expect(result?.recovered).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.supplierCatalogItems).toHaveLength(0);
    expect(stored.clients).toHaveLength(1);
  });

  it("isQuotaExceededError détecte QuotaExceededError", () => {
    const error = new DOMException("quota", "QuotaExceededError");
    expect(isQuotaExceededError(error)).toBe(true);
    expect(isQuotaExceededError({ name: "QuotaExceededError", code: 22 })).toBe(true);
    expect(isQuotaExceededError(new Error("other"))).toBe(false);
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

  it("normalizeData conserve hideCatalogMenu dans les paramètres", () => {
    const normalized = normalizeData({
      ...emptyData,
      settings: {
        ...emptyData.settings,
        hideCatalogMenu: true,
      },
    });

    expect(normalized.settings.hideCatalogMenu).toBe(true);
  });
});
