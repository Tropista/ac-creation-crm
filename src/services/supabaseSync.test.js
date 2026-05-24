import { describe, expect, it } from "vitest";
import {
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
