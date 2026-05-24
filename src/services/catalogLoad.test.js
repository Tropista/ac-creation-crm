import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  formatCatalogLoadToast,
  isCatalogDataEmpty,
  mergeCatalogRecoveryIntoState,
} from "./catalogLoad.js";

describe("catalogLoad", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("isCatalogDataEmpty détecte les collections vides", () => {
    expect(isCatalogDataEmpty({})).toBe(true);
    expect(
      isCatalogDataEmpty({
        supplierCatalogItems: [],
        clientCatalogItems: [],
        catalogSelections: [],
      })
    ).toBe(true);
    expect(
      isCatalogDataEmpty({
        clientCatalogItems: [{ id: "c1" }],
      })
    ).toBe(false);
  });

  it("mergeCatalogRecoveryIntoState fusionne la récupération cloud", () => {
    const merged = mergeCatalogRecoveryIntoState(
      { clientCatalogItems: [], supplierCatalogItems: [], catalogSelections: [] },
      {
        supplierCatalogItems: [{ id: "s1", name: "Pool" }],
        clientCatalogItems: [{ id: "c1", name: "Client" }],
        catalogSelections: [{ id: "sel1", title: "Sélection" }],
      }
    );

    expect(merged.supplierCatalogItems).toHaveLength(1);
    expect(merged.clientCatalogItems).toHaveLength(1);
    expect(merged.catalogSelections).toHaveLength(1);
  });

  it("formatCatalogLoadToast résume le chargement en français", () => {
    const toast = formatCatalogLoadToast(
      { hasCatalogData: true, fetchErrorMessage: null, partial: false },
      {
        clientCatalogItems: [{ id: "c1" }],
        supplierCatalogItems: [{ id: "s1" }, { id: "s2" }],
        catalogSelections: [],
      }
    );

    expect(toast.message).toContain("catalogue client");
    expect(toast.type).toBe("success");
  });
});
