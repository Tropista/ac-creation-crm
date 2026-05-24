import { describe, expect, it } from "vitest";
import { shouldSkipMassDelete, MASS_DELETE_GUARD_MIN } from "./supabaseSync.js";

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
