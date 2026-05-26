import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  dismissPublicAcceptance,
  findNewPublicAcceptances,
  getRecentPublicAcceptances,
  isPublicLinkAcceptance,
} from "./publicQuoteAcceptance.js";

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

describe("publicQuoteAcceptance", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  it("détecte une acceptation via lien public", () => {
    expect(
      isPublicLinkAcceptance({
        status: "Accepté",
        acceptedVia: "public-link",
        acceptedAt: "2026-05-26T10:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isPublicLinkAcceptance({
        status: "Accepté",
        acceptedAt: "2026-05-26T10:00:00.000Z",
      })
    ).toBe(false);
  });

  it("repère les nouvelles acceptations après sync", () => {
    const before = [{ id: "q1", status: "Envoyé" }];
    const after = [
      {
        id: "q1",
        number: "DEV-1",
        status: "Accepté",
        acceptedVia: "public-link",
        acceptedAt: "2026-05-26T10:00:00.000Z",
      },
    ];

    expect(findNewPublicAcceptances(before, after)).toHaveLength(1);
    expect(findNewPublicAcceptances(after, after)).toHaveLength(0);
  });

  it("masque les acceptations marquées vues", () => {
    const quotes = [
      {
        id: "q1",
        status: "Accepté",
        acceptedVia: "public-link",
        acceptedAt: new Date().toISOString(),
      },
    ];

    expect(getRecentPublicAcceptances(quotes)).toHaveLength(1);
    dismissPublicAcceptance("q1");
    expect(getRecentPublicAcceptances(quotes)).toHaveLength(0);
  });
});
