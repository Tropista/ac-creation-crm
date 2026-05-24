import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_PAGE_SIZE,
  COLLECTION_PAGE_SIZE,
  fetchCollectionRows,
  fetchCollectionRowsDetailed,
  formatCatalogFetchLog,
  formatCatalogPartialFetchError,
  formatCatalogRecoveryErrors,
  formatCatalogSyncMessage,
  formatSupabaseCollectionError,
  getCollectionDelta,
  isStatementTimeoutError,
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

  it("charge toutes les pages catalogue avec CATALOG_PAGE_SIZE (2500 lignes)", async () => {
    const makePage = (start, count) =>
      Array.from({ length: count }, (_, i) => ({
        id: `row-${start + i}`,
        data: { name: `Item ${start + i}` },
      }));

    const supabase = createMockSupabase({
      client_catalog_items: [
        makePage(0, CATALOG_PAGE_SIZE),
        makePage(CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(2 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(3 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(4 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(5 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(6 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(7 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(8 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(9 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(10 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(11 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(12 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(13 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(14 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(15 * CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE),
        makePage(16 * CATALOG_PAGE_SIZE, 100),
      ],
    });

    const rows = await fetchCollectionRows(supabase, "client_catalog_items");

    expect(rows).toHaveLength(2500);
    expect(supabase.calls.length).toBeGreaterThan(10);
    expect(supabase.calls[0]).toMatchObject({
      from: 0,
      to: CATALOG_PAGE_SIZE - 1,
    });
  });

  it("s'arrête sur une page partielle (< taille de page)", async () => {
    const page1 = Array.from({ length: 440 }, (_, i) => ({
      id: `row-${i}`,
      data: {},
    }));

    const supabase = createMockSupabase({
      clients: [page1],
    });

    const rows = await fetchCollectionRows(supabase, "clients");

    expect(rows).toHaveLength(440);
    expect(supabase.calls).toHaveLength(1);
  });

  it("réduit la taille de page et réessaie après un statement timeout", async () => {
    vi.useFakeTimers();
    const timeoutError = {
      code: "57014",
      message: "canceling statement due to statement timeout",
    };

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
          range(_from, to) {
            rangeCalls += 1;
            if (rangeCalls === 1) {
              return Promise.resolve({ data: null, error: timeoutError });
            }
            if (rangeCalls === 2) {
              return Promise.resolve({
                data: Array.from({ length: to - _from + 1 }, (_, i) => ({
                  id: `row-${i}`,
                  data: {},
                })),
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        };
        return chain;
      },
    };

    const promise = fetchCollectionRows(supabase, "client_catalog_items");
    await vi.runAllTimersAsync();
    const rows = await promise;

    expect(isStatementTimeoutError(timeoutError)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rangeCalls).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it("retourne un chargement partiel si allowPartial et timeout en cours de pagination", async () => {
    const page1 = Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => ({
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

    const result = await fetchCollectionRowsDetailed(supabase, "supplier_catalog_items", {
      allowPartial: true,
      minPageSize: CATALOG_PAGE_SIZE,
    });

    expect(result.partial).toBe(true);
    expect(result.rows).toHaveLength(CATALOG_PAGE_SIZE);
    expect(result.error?.message).toContain("statement timeout");
  });

  it("signale les erreurs partielles en français", () => {
    const message = formatCatalogPartialFetchError(
      "client_catalog_items",
      450,
      new Error("canceling statement due to statement timeout")
    );
    expect(message).toContain("450");
    expect(message).toContain("client_catalog_items");

    const combined = formatCatalogRecoveryErrors([
      {
        tableName: "client_catalog_items",
        rows: Array.from({ length: 450 }),
        error: new Error("timeout"),
        partial: true,
      },
    ]);
    expect(combined).toContain("client_catalog_items");
  });

  it("propage les erreurs Supabase fatales (allowPartial=false)", async () => {
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
