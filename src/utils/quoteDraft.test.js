import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  QUOTE_DRAFT_KEY,
  saveQuoteDraft,
  peekQuoteDraft,
  consumeQuoteDraft,
  getCrmQuotesUrl,
} from "./quoteDraft";

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("quoteDraft", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  it("sauvegarde et consomme un brouillon", () => {
    saveQuoteDraft({ source: "test", lines: [{ description: "Ligne", quantity: 2 }] });
    expect(peekQuoteDraft()?.source).toBe("test");
    const draft = consumeQuoteDraft();
    expect(draft?.lines[0].description).toBe("Ligne");
    expect(localStorage.getItem(QUOTE_DRAFT_KEY)).toBeNull();
  });

  it("retourne l’URL Devis en mode hash", () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:", pathname: "/index.html" },
    });
    expect(getCrmQuotesUrl()).toBe("/index.html#/devis");
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", createStorage());
  });
});
