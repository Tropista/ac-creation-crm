import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  emptyData,
  hasLocalBusinessData,
  saveData,
  loadData,
  flushSaveData,
  STORAGE_KEY,
  isQuotaExceededError,
} from "./dataService.js";
import { stampDataChanges } from "./syncMerge.js";

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

  it("hasLocalBusinessData détecte les collections métier", () => {
    expect(hasLocalBusinessData(emptyData)).toBe(false);
    expect(emptyData.settings.paymentDays).toBe(30);
    expect(
      hasLocalBusinessData({
        ...emptyData,
        clients: [{ id: "c1", name: "Client" }],
      })
    ).toBe(true);
    expect(
      hasLocalBusinessData({
        ...emptyData,
        products: [{ id: "p1", name: "Produit" }],
      })
    ).toBe(true);
  });

  it("saveData et loadData conservent les clients", () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);

    const payload = {
      ...emptyData,
      clients: [{ id: "c1", name: "AC Creation" }],
    };
    saveData(payload);
    flushSaveData();

    const loaded = loadData();
    expect(loaded.clients).toHaveLength(1);
    expect(loaded.clients[0].name).toBe("AC Creation");
  });

  it("saveData retire les images produits base64 trop lourdes du localStorage", () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);

    const largeBase64 = `data:image/jpeg;base64,${"A".repeat(200000)}`;
    const payload = {
      ...emptyData,
      products: [
        { id: "p1", name: "Lourd", imageUrl: largeBase64 },
        { id: "p2", name: "URL", imageUrl: "https://cdn.example.com/p.jpg" },
      ],
    };

    saveData(payload);
    flushSaveData();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.products[0].imageUrl).toBe("");
    expect(stored.products[1].imageUrl).toBe("https://cdn.example.com/p.jpg");
  });

  it("flushSaveData signale QuotaExceededError", () => {
    const storage = createStorage({ quotaBytes: 50 });
    vi.stubGlobal("localStorage", storage);

    const payload = {
      ...emptyData,
      clients: [{ id: "cl1", name: "Client test avec un nom très long pour dépasser le quota" }],
    };

    saveData(payload);
    const result = flushSaveData();

    expect(result?.ok).toBe(false);
    expect(result?.quotaExceeded).toBe(true);
  });

  it("isQuotaExceededError détecte QuotaExceededError", () => {
    const error = new DOMException("quota", "QuotaExceededError");
    expect(isQuotaExceededError(error)).toBe(true);
    expect(isQuotaExceededError({ name: "QuotaExceededError", code: 22 })).toBe(true);
    expect(isQuotaExceededError(new Error("other"))).toBe(false);
  });
});

describe("data persistence", () => {
  it("journal d'activité ne doit pas effacer les clients", () => {
    const afterImport = stampDataChanges(emptyData, {
      ...emptyData,
      clients: [{ id: "c1", name: "Client" }],
    });

    const logUpdate = {
      ...afterImport,
      logs: [
        {
          id: "log-1",
          action: "Modification client",
          target: "Client",
          details: "Mise à jour",
        },
      ],
    };

    const afterLog = stampDataChanges(afterImport, logUpdate);
    expect(afterLog.clients).toHaveLength(1);
    expect(afterLog.logs).toHaveLength(1);
  });
});
