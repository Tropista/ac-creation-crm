import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LAST_SYNC_AT_KEY,
  getLastSyncAt,
  hasLocalCatalogChangesSinceSync,
  hasUnsyncedCatalogChanges,
  mergeCloudWithLocal,
  mergeCollection,
  mergeCatalogSelectionRecord,
  mergeCatalogSelectionsCollection,
  countCatalogSubmissionsReceived,
  parseUpdatedAt,
  resolveCloudInitError,
  setLastSyncAt,
  stampCollectionChanges,
  stampDataChanges,
  SYNC_STATUS,
} from "./syncMerge.js";
import { importScrapedToCollection } from "../utils/lmdtImport.js";
import { emptyData } from "./dataService.js";

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

    const localItems = [
      { id: "s1", name: "Article importé", updatedAt: "2026-05-24T10:00:00.000Z" },
      { id: "s2", name: "Article importé 2", updatedAt: "2026-05-24T10:00:00.000Z" },
    ];

    const merged = mergeCloudWithLocal(
      { supplierCatalogItems: localItems },
      { supplierCatalogItems: [] }
    );

    expect(merged.supplierCatalogItems).toHaveLength(2);
  });

  it("mergeCloudWithLocal conserve les imports locaux récents avec un cloud volumineux", () => {
    setLastSyncAt(Date.parse("2026-05-24T08:00:00.000Z"));

    const localItems = Array.from({ length: 5 }, (_, index) => ({
      id: `new-${index}`,
      name: `Import ${index}`,
      updatedAt: "2026-05-24T10:00:00.000Z",
    }));
    const cloudItems = Array.from({ length: 962 }, (_, index) => ({
      id: `c${index}`,
      name: `Client ${index}`,
      updatedAt: "2026-05-23T10:00:00.000Z",
    }));

    const merged = mergeCloudWithLocal(
      { clientCatalogItems: localItems },
      { clientCatalogItems: cloudItems }
    );

    expect(merged.clientCatalogItems).toHaveLength(967);
    expect(merged.clientCatalogItems.some((item) => item.id === "new-0")).toBe(true);
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

  it("hasUnsyncedCatalogChanges détecte les articles absents du cloud", () => {
    setLastSyncAt(Date.parse("2026-05-24T08:00:00.000Z"));

    expect(
      hasUnsyncedCatalogChanges(
        {
          supplierCatalogItems: [
            { id: "s1", name: "Pool", updatedAt: "2026-05-24T10:00:00.000Z" },
          ],
        },
        { supplierCatalogItems: [] }
      )
    ).toBe(true);
  });

  it("import puis rechargement merge conserve pool fournisseur et catalogue client", () => {
    setLastSyncAt(Date.parse("2026-05-24T08:00:00.000Z"));

    const scraped = [
      {
        name: "Sol's Regent",
        sku: "SO-11380",
        category: "Tee-shirts",
        priceHT: 1.77,
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      },
    ];

    const cloudItems = Array.from({ length: 962 }, (_, index) => ({
      id: `c${index}`,
      name: `Client ${index}`,
      updatedAt: "2026-05-23T10:00:00.000Z",
    }));

    let local = emptyData;
    const supplierImport = importScrapedToCollection(local, scraped, "supplierCatalogItems");
    local = stampDataChanges(local, supplierImport.nextData);
    const clientImport = importScrapedToCollection(local, scraped, "clientCatalogItems");
    local = stampDataChanges(local, clientImport.nextData);

    const merged = mergeCloudWithLocal(
      local,
      { clientCatalogItems: cloudItems, supplierCatalogItems: [] }
    );

    expect(merged.supplierCatalogItems).toHaveLength(1);
    expect(merged.clientCatalogItems).toHaveLength(963);
    expect(hasLocalCatalogChangesSinceSync(merged.supplierCatalogItems, getLastSyncAt())).toBe(
      true
    );
  });

  it("mergeCatalogSelectionRecord préfère la réponse client cloud", () => {
    const local = {
      id: "sel1",
      title: "Projet club",
      status: "open",
      updatedAt: "2026-05-24T10:00:00.000Z",
    };
    const cloud = {
      id: "sel1",
      title: "Projet club",
      status: "submitted",
      updatedAt: "2026-05-24T11:00:00.000Z",
      clientSubmission: {
        clientName: "AS Sportive",
        choices: [{ productId: "p1", quantity: 10 }],
        submittedAt: "2026-05-24T11:00:00.000Z",
      },
    };

    const merged = mergeCatalogSelectionRecord(local, cloud);

    expect(merged.status).toBe("submitted");
    expect(merged.clientSubmission.clientName).toBe("AS Sportive");
  });

  it("countCatalogSubmissionsReceived compte les sélections soumises", () => {
    expect(
      countCatalogSubmissionsReceived([
        { id: "1", status: "open" },
        {
          id: "2",
          status: "submitted",
          clientSubmission: { submittedAt: "2026-05-24T11:00:00.000Z" },
        },
      ])
    ).toBe(1);
  });

  it("mergeCatalogSelectionsCollection fusionne les réponses client", () => {
    const merged = mergeCatalogSelectionsCollection(
      [{ id: "1", status: "open", updatedAt: "2026-05-24T10:00:00.000Z" }],
      [
        {
          id: "1",
          status: "submitted",
          updatedAt: "2026-05-24T11:00:00.000Z",
          clientSubmission: {
            submittedAt: "2026-05-24T11:00:00.000Z",
            choices: [],
          },
        },
      ]
    );

    expect(merged[0].status).toBe("submitted");
    expect(merged[0].clientSubmission.submittedAt).toBe("2026-05-24T11:00:00.000Z");
  });

  it("resolveCloudInitError marque récupéré si le catalogue cloud a été restauré", () => {
    const outcome = resolveCloudInitError({ catalogRecovered: true });
    expect(outcome.cloudAvailable).toBe(true);
    expect(outcome.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(outcome.toast?.message).toContain("Catalogue récupéré");
  });
});
