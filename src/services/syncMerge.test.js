import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LAST_SYNC_AT_KEY,
  getLastSyncAt,
  mergeCloudWithLocal,
  mergeCollection,
  parseUpdatedAt,
  setLastSyncAt,
  stampCollectionChanges,
  stampDataChanges,
} from "./syncMerge.js";

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

describe("syncMerge", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parseUpdatedAt retourne 0 sans timestamp", () => {
    expect(parseUpdatedAt({})).toBe(0);
    expect(parseUpdatedAt({ updatedAt: "invalid" })).toBe(0);
  });

  it("stampCollectionChanges ajoute updatedAt aux enregistrements modifiés", () => {
    const previous = [{ id: "1", name: "A" }];
    const next = [{ id: "1", name: "B" }];
    const stamped = stampCollectionChanges(previous, next, "2026-05-23T10:00:00.000Z");

    expect(stamped[0].updatedAt).toBe("2026-05-23T10:00:00.000Z");
  });

  it("stampDataChanges met à jour settings et collections", () => {
    const previous = {
      settings: { companyName: "A" },
      clients: [{ id: "c1", name: "Client" }],
    };
    const next = {
      settings: { companyName: "B" },
      clients: [{ id: "c1", name: "Client modifié" }],
    };

    const stamped = stampDataChanges(previous, next);
    expect(stamped.settings.updatedAt).toBeTruthy();
    expect(stamped.clients[0].updatedAt).toBeTruthy();
  });

  it("mergeCollection conserve la version cloud si seule la cloud a changé", () => {
    setLastSyncAt(Date.parse("2026-05-23T09:00:00.000Z"));

    const merged = mergeCollection(
      [{ id: "1", name: "Local", updatedAt: "2026-05-23T08:00:00.000Z" }],
      [{ id: "1", name: "Cloud", updatedAt: "2026-05-23T10:00:00.000Z" }],
      { lastSyncAt: getLastSyncAt() }
    );

    expect(merged[0].name).toBe("Cloud");
  });

  it("mergeCollection conserve la version locale sur conflit critique", () => {
    setLastSyncAt(Date.parse("2026-05-23T09:00:00.000Z"));
    const onConflict = vi.fn();

    const merged = mergeCollection(
      [{ id: "1", name: "Local", updatedAt: "2026-05-23T10:00:00.000Z" }],
      [{ id: "1", name: "Cloud", updatedAt: "2026-05-23T11:00:00.000Z" }],
      {
        lastSyncAt: Date.parse("2026-05-23T09:00:00.000Z"),
        critical: true,
        onConflict,
        entityLabel: "clients",
      }
    );

    expect(merged[0].name).toBe("Local");
    expect(onConflict).toHaveBeenCalledOnce();
  });

  it("mergeCloudWithLocal fusionne plusieurs collections", () => {
    setLastSyncAt(Date.parse("2026-05-23T09:00:00.000Z"));

    const local = {
      settings: { companyName: "Local", updatedAt: "2026-05-23T10:00:00.000Z" },
      clients: [{ id: "c1", name: "Local", updatedAt: "2026-05-23T10:00:00.000Z" }],
      products: [{ id: "p1", name: "Produit local", updatedAt: "2026-05-23T08:00:00.000Z" }],
    };

    const cloud = {
      settings: { companyName: "Cloud", updatedAt: "2026-05-23T08:00:00.000Z" },
      clients: [{ id: "c1", name: "Cloud", updatedAt: "2026-05-23T11:00:00.000Z" }],
      products: [{ id: "p1", name: "Produit cloud", updatedAt: "2026-05-23T11:00:00.000Z" }],
    };

    const merged = mergeCloudWithLocal(local, cloud);
    expect(merged.settings.companyName).toBe("Local");
    expect(merged.clients[0].name).toBe("Local");
    expect(merged.products[0].name).toBe("Produit cloud");
  });

  it("setLastSyncAt persiste dans localStorage", () => {
    setLastSyncAt(1234567890);
    expect(localStorage.getItem(LAST_SYNC_AT_KEY)).toBe("1234567890");
  });
});
