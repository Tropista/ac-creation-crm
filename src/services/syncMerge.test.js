import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LAST_SYNC_AT_KEY,
  getLastSyncAt,
  mergeCloudWithLocal,
  mergeCollection,
  parseUpdatedAt,
  resolveCloudInitError,
  setLastSyncAt,
  stampCollectionChanges,
  stampDataChanges,
  SYNC_STATUS,
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

  it("mergeCloudWithLocal conserve le catalogue local si le cloud est vide", () => {
    setLastSyncAt(Date.parse("2026-05-23T09:00:00.000Z"));

    const localItems = Array.from({ length: 60 }, (_, index) => ({
      id: `s${index}`,
      name: `Article ${index}`,
      updatedAt: "2026-05-23T10:00:00.000Z",
    }));

    const merged = mergeCloudWithLocal(
      { supplierCatalogItems: localItems },
      { supplierCatalogItems: [] }
    );

    expect(merged.supplierCatalogItems).toHaveLength(60);
  });

  it("mergeCloudWithLocal préfère le cloud si le catalogue local est vide", () => {
    const cloudItems = Array.from({ length: 962 }, (_, index) => ({
      id: `c${index}`,
      name: `Client ${index}`,
    }));

    const merged = mergeCloudWithLocal(
      { clientCatalogItems: [] },
      { clientCatalogItems: cloudItems }
    );

    expect(merged.clientCatalogItems).toHaveLength(962);
  });

  it("mergeCloudWithLocal préfère le cloud volumineux si le local est quasi vide", () => {
    const localItems = [{ id: "local-1", name: "Local seul" }];
    const cloudItems = Array.from({ length: 60 }, (_, index) => ({
      id: `cloud-${index}`,
      name: `Cloud ${index}`,
    }));

    const merged = mergeCloudWithLocal(
      { supplierCatalogItems: localItems },
      { supplierCatalogItems: cloudItems }
    );

    expect(merged.supplierCatalogItems).toHaveLength(60);
  });

  it("setLastSyncAt persiste dans localStorage", () => {
    setLastSyncAt(1234567890);
    expect(localStorage.getItem(LAST_SYNC_AT_KEY)).toBe("1234567890");
  });

  it("resolveCloudInitError conserve le statut sync si le cloud a déjà réussi", () => {
    const outcome = resolveCloudInitError({ cloudAlreadySynced: true });
    expect(outcome.cloudAvailable).toBe(true);
    expect(outcome.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(outcome.toast).toBeNull();
  });

  it("resolveCloudInitError signale l'indisponibilité cloud sans sync préalable", () => {
    const outcome = resolveCloudInitError({ cloudAlreadySynced: false });
    expect(outcome.cloudAvailable).toBe(false);
    expect(outcome.syncStatus).toBe(SYNC_STATUS.LOCAL_UNAVAILABLE);
    expect(outcome.toast?.message).toContain("Sync cloud indisponible");
  });

  it("resolveCloudInitError marque récupéré si le catalogue cloud a été restauré", () => {
    const outcome = resolveCloudInitError({ catalogRecovered: true });
    expect(outcome.cloudAvailable).toBe(true);
    expect(outcome.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(outcome.toast?.message).toContain("Catalogue récupéré");
  });
});
