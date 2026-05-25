import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LAST_SYNC_AT_KEY,
  clearSyncedDeletionTombstones,
  collectDeletions,
  filterCollectionByTombstones,
  formatLastSyncRelative,
  formatSyncConflictMessage,
  getLastSyncAt,
  isItemTombstoned,
  mergeCloudWithLocal,
  mergeCollection,
  mergeDeletionTombstones,
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

  it("collectDeletions détecte les ids retirés d'une collection", () => {
    const deletions = collectDeletions(
      [{ id: "c1" }, { id: "c2" }],
      [{ id: "c1" }],
      "2026-05-25T12:00:00.000Z"
    );

    expect(deletions).toEqual({ c2: "2026-05-25T12:00:00.000Z" });
  });

  it("stampDataChanges enregistre un tombstone lors d'une suppression locale", () => {
    const previous = {
      settings: { companyName: "AC Creation" },
      clients: [{ id: "c1", name: "Client à supprimer" }],
    };
    const next = {
      settings: { companyName: "AC Creation" },
      clients: [],
    };

    const stamped = stampDataChanges(previous, next);

    expect(stamped.clients).toEqual([]);
    expect(stamped.settings.deletionTombstones.clients.c1).toBeTruthy();
  });

  it("mergeCollection ignore le cloud si l'id est tombstoné localement", () => {
    const merged = mergeCollection(
      [],
      [{ id: "c1", name: "Client cloud" }],
      {
        deletionTombstones: { c1: "2026-05-25T12:00:00.000Z" },
      }
    );

    expect(merged).toEqual([]);
  });

  it("isItemTombstoned ignore un enregistrement recréé après la suppression", () => {
    expect(
      isItemTombstoned(
        { id: "c1", updatedAt: "2026-05-25T14:00:00.000Z" },
        "2026-05-25T12:00:00.000Z"
      )
    ).toBe(false);

    expect(
      isItemTombstoned(
        { id: "c1", updatedAt: "2026-05-25T10:00:00.000Z" },
        "2026-05-25T12:00:00.000Z"
      )
    ).toBe(true);
  });

  it("mergeCollection ignore le cloud même si local et cloud existent encore", () => {
    const merged = mergeCollection(
      [{ id: "c1", name: "Local", updatedAt: "2026-05-25T10:00:00.000Z" }],
      [{ id: "c1", name: "Cloud", updatedAt: "2026-05-25T11:00:00.000Z" }],
      {
        deletionTombstones: { c1: "2026-05-25T12:00:00.000Z" },
      }
    );

    expect(merged).toEqual([]);
  });

  it("filterCollectionByTombstones retire les lignes cloud encore présentes", () => {
    const filtered = filterCollectionByTombstones(
      [
        { id: "c1", name: "Fantôme", updatedAt: "2026-05-20T08:00:00.000Z" },
        { id: "c2", name: "Actif", updatedAt: "2026-05-20T08:00:00.000Z" },
      ],
      { c1: "2026-05-25T12:00:00.000Z" }
    );

    expect(filtered.map((item) => item.id)).toEqual(["c2"]);
  });

  it("mergeCloudWithLocal ne restaure pas un client supprimé localement", () => {
    setLastSyncAt(Date.parse("2026-05-23T09:00:00.000Z"));

    const local = {
      settings: {
        companyName: "Local",
        deletionTombstones: {
          clients: { c1: "2026-05-25T12:00:00.000Z" },
        },
      },
      clients: [],
      quotes: [],
      invoices: [],
    };

    const cloud = {
      settings: { companyName: "Cloud" },
      clients: [{ id: "c1", name: "Client fantôme", updatedAt: "2026-05-20T08:00:00.000Z" }],
      quotes: [],
      invoices: [],
    };

    const merged = mergeCloudWithLocal(local, cloud);

    expect(merged.clients).toEqual([]);
  });

  it("mergeDeletionTombstones conserve la suppression la plus récente", () => {
    const merged = mergeDeletionTombstones(
      { clients: { c1: "2026-05-25T10:00:00.000Z" } },
      { clients: { c1: "2026-05-25T12:00:00.000Z" } }
    );

    expect(merged.clients.c1).toBe("2026-05-25T12:00:00.000Z");
  });

  it("clearSyncedDeletionTombstones retire les tombstones synchronisés", () => {
    const settings = {
      companyName: "AC Creation",
      deletionTombstones: {
        clients: { c1: "2026-05-25T12:00:00.000Z" },
        quotes: { q1: "2026-05-25T12:00:00.000Z" },
      },
    };

    const cleared = clearSyncedDeletionTombstones(settings, {
      clients: [],
      quotes: [],
    });

    expect(cleared.deletionTombstones).toBeUndefined();
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

  it("formatLastSyncRelative affiche le délai en français", () => {
    const now = Date.parse("2026-05-24T12:00:00.000Z");
    expect(formatLastSyncRelative(0, now)).toBe("Dernière sync : jamais");
    expect(formatLastSyncRelative(now - 30_000, now)).toBe("Dernière sync : à l'instant");
    expect(formatLastSyncRelative(now - 5 * 60_000, now)).toBe("Dernière sync : il y a 5 min");
    expect(formatLastSyncRelative(now - 3 * 60 * 60_000, now)).toBe("Dernière sync : il y a 3 h");
  });

  it("formatSyncConflictMessage inclut la référence document", () => {
    const message = formatSyncConflictMessage({
      entityLabel: "invoices",
      local: { id: "inv-1", number: "FAC-2026-042" },
    });

    expect(message).toContain("FAC-2026-042");
    expect(message).toContain("inv-1");
    expect(message).toContain("facture");
    expect(message).toContain("Resynchroniser");
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
});
