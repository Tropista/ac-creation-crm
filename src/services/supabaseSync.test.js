import { describe, expect, it, vi } from "vitest";
import {
  COLLECTION_PAGE_SIZE,
  fetchCollectionRows,
  formatCatalogFetchLog,
  formatCatalogSyncMessage,
  formatSupabaseCollectionError,
  getCollectionDelta,
  shouldSkipMassDelete,
  MASS_DELETE_GUARD_MIN,
} from "./supabaseSync.js";

describe("supabaseSync mass delete guard", () => {
  it("bloque la suppression quand le snapshot suivant est vide", () => {
    const previous = Array.from({ length: MASS_DELETE_GUARD_MIN }, (_, i) => ({ id: `x${i}` }));
    expect(shouldSkipMassDelete([], previous, previous.length)).toBe(true);
  });

  it("autorise la suppression quand il reste des enregistrements", () => {
    const previous = Array.from({ length: MASS_DELETE_GUARD_MIN }, (_, i) => ({ id: `x${i}` }));
    const next = previous.slice(0, 10);
    expect(shouldSkipMassDelete(next, previous, previous.length - next.length)).toBe(false);
  });

  it("autorise la suppression de petites collections", () => {
    const previous = [{ id: "a" }, { id: "b" }];
    expect(shouldSkipMassDelete([], previous, 2)).toBe(false);
  });
});

describe("supabaseSync catalog delta", () => {
  it("getCollectionDelta ne retourne que les articles nouveaux ou modifiés", () => {
    const previous = [
      { id: "a", name: "Ancien", sku: "SKU-A" },
      { id: "b", name: "Inchangé", sku: "SKU-B" },
    ];
    const next = [
      { id: "a", name: "Modifié", sku: "SKU-A" },
      { id: "b", name: "Inchangé", sku: "SKU-B" },
      { id: "c", name: "Nouveau", sku: "SKU-C" },
    ];

    const delta = getCollectionDelta(previous, next);
    expect(delta.map((item) => item.id).sort()).toEqual(["a", "c"]);
  });

  it("formatSupabaseCollectionError signale une table catalogue absente", () => {
    const error = formatSupabaseCollectionError("supplier_catalog_items", {
      code: "PGRST205",
      message: 'Could not find the table "public.supplier_catalog_items"',
    });

    expect(error.message).toContain("supplier_catalog_items");
    expect(error.message).toContain("supabase-migration.sql");
  });

  it("formatSupabaseCollectionError signale un refus RLS", () => {
    const error = formatSupabaseCollectionError("client_catalog_items", {
      code: "42501",
      message: "new row violates row-level security policy",
    });

    expect(error.message).toContain("Permission refusée");
    expect(error.message).toContain("client_catalog_items");
  });
});

describe("fetchCollectionRows pagination", () => {
  function createMockSupabase(pagesByTable) {
    const calls = [];
    const pageState = new Map();

    return {
      calls,
      from(tableName) {
        if (!pageState.has(tableName)) {
          pageState.set(tableName, 0);
        }

        const pages = pagesByTable[tableName] || [];

        const chain = {
          select() {
            return chain;
          },
          order() {
            return chain;
          },
          range(from, to) {
            const callIndex = pageState.get(tableName);
            calls.push({ tableName, from, to, callIndex });
            const page = pages[callIndex] ?? [];
            pageState.set(tableName, callIndex + 1);
            return Promise.resolve({ data: page, error: null });
          },
        };

        return chain;
      },
    };
  }

  it("charge toutes les pages jusqu'à épuisement (2500 lignes = 3 pages)", async () => {
    const makePage = (start, count) =>
      Array.from({ length: count }, (_, i) => ({
        id: `row-${start + i}`,
        data: { name: `Item ${start + i}` },
      }));

    const supabase = createMockSupabase({
      client_catalog_items: [
        makePage(0, COLLECTION_PAGE_SIZE),
        makePage(COLLECTION_PAGE_SIZE, COLLECTION_PAGE_SIZE),
        makePage(2 * COLLECTION_PAGE_SIZE, 500),
      ],
    });

    const rows = await fetchCollectionRows(supabase, "client_catalog_items");

    expect(rows).toHaveLength(2500);
    expect(supabase.calls).toHaveLength(3);
    expect(supabase.calls[0]).toMatchObject({ from: 0, to: COLLECTION_PAGE_SIZE - 1 });
    expect(supabase.calls[1]).toMatchObject({
      from: COLLECTION_PAGE_SIZE,
      to: 2 * COLLECTION_PAGE_SIZE - 1,
    });
    expect(supabase.calls[2]).toMatchObject({
      from: 2 * COLLECTION_PAGE_SIZE,
      to: 3 * COLLECTION_PAGE_SIZE - 1,
    });
  });

  it("s'arrête sur une page partielle (< 1000 lignes)", async () => {
    const page1 = Array.from({ length: 440 }, (_, i) => ({
      id: `row-${i}`,
      data: {},
    }));

    const supabase = createMockSupabase({
      supplier_catalog_items: [page1],
    });

    const rows = await fetchCollectionRows(supabase, "supplier_catalog_items");

    expect(rows).toHaveLength(440);
    expect(supabase.calls).toHaveLength(1);
  });

  it("propage les erreurs Supabase (ne tronque pas silencieusement à 1000)", async () => {
    const page1 = Array.from({ length: COLLECTION_PAGE_SIZE }, (_, i) => ({
      id: `row-${i}`,
      data: {},
    }));

    let rangeCalls = 0;
    const supabase = {
      from() {
        const chain = {
          select() {
            return chain;
          },
          order() {
            return chain;
          },
          range() {
            rangeCalls += 1;
            if (rangeCalls === 1) {
              return Promise.resolve({ data: page1, error: null });
            }
            return Promise.resolve({
              data: null,
              error: { code: "57014", message: "canceling statement due to statement timeout" },
            });
          },
        };
        return chain;
      },
    };

    await expect(fetchCollectionRows(supabase, "client_catalog_items")).rejects.toThrow(
      "canceling statement due to statement timeout"
    );
  });

  it("formatCatalogFetchLog et formatCatalogSyncMessage affichent les totaux", () => {
    expect(formatCatalogFetchLog("client_catalog_items", 2500, 3)).toContain("2500");
    expect(formatCatalogFetchLog("client_catalog_items", 2500, 3)).toContain("3 pages");

    expect(formatCatalogSyncMessage(1440, 6000)).toContain("1440");
    expect(formatCatalogSyncMessage(1440, 6000)).toContain("6000");
    expect(formatCatalogSyncMessage(0, 0)).toContain("Catalogue synchronisé");
  });
});
