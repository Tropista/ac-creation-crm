import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildCatalogMailtoUrl,
  buildCatalogProductSheet,
  buildProductSnapshots,
  compactSelectionForPublicCache,
  createCatalogSelectionPayload,
  mergeLiveCatalogImages,
  pruneOldPublicCatalogCaches,
  PUBLIC_CATALOG_CACHE_PREFIX,
  resolveCatalogRecipientEmail,
  resolveProductMinQuantity,
  resolveProductSizeOptions,
  sanitizeImageUrlForCache,
  savePublicCatalogCache,
} from "./catalogShare";

function createStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
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

describe("catalogShare product sheet", () => {
  const product = {
    id: "p1",
    name: "T-shirt Regent",
    sku: "REG-001",
    description: "Coton bio\nSource: https://example.com",
    price: 12.5,
    colors: ["Noir"],
    sizes: ["S", "M", "L"],
    minOrderQty: 10,
  };

  it("builds snapshots with sizes and min order", () => {
    const [snapshot] = buildProductSnapshots([product]);
    expect(snapshot.sizes).toEqual(["S", "M", "L"]);
    expect(snapshot.minOrderQty).toBe(10);
  });

  it("strips base64 product images but keeps http color image urls in snapshots", () => {
    const [snapshot] = buildProductSnapshots([
      {
        ...product,
        imageUrl: "data:image/jpeg;base64,abc123",
        colors: [{ name: "Noir", hex: "#000", imageUrl: "https://example.com/swatch.jpg" }],
      },
    ]);

    expect(snapshot.imageUrl).toBe("");
    expect(snapshot.colors).toEqual([
      { name: "Noir", hex: "#000", imageUrl: "https://example.com/swatch.jpg" },
    ]);
  });

  it("strips base64 color image urls from snapshots", () => {
    const [snapshot] = buildProductSnapshots([
      {
        ...product,
        colors: [{ name: "Blanc", hex: "#fff", imageUrl: "data:image/jpeg;base64,abc123" }],
      },
    ]);

    expect(snapshot.colors).toEqual([{ name: "Blanc", hex: "#fff" }]);
  });

  it("merges per-color image urls from live catalog items", () => {
    const [merged] = mergeLiveCatalogImages(
      [
        {
          id: "p1",
          name: "T-shirt",
          imageUrl: "https://example.com/default.jpg",
          colors: [{ name: "Noir", hex: "#000" }, { name: "Blanc", hex: "#fff" }],
        },
      ],
      [
        {
          id: "p1",
          imageUrl: "https://example.com/live-default.jpg",
          colors: [
            { name: "Noir", hex: "#000", imageUrl: "https://example.com/noir.jpg" },
            { name: "Blanc", hex: "#fff", imageUrl: "https://example.com/blanc.jpg" },
          ],
        },
      ]
    );

    expect(merged.imageUrl).toBe("https://example.com/live-default.jpg");
    expect(merged.colors).toEqual([
      { name: "Noir", hex: "#000", imageUrl: "https://example.com/noir.jpg" },
      { name: "Blanc", hex: "#fff", imageUrl: "https://example.com/blanc.jpg" },
    ]);
  });

  it("compacts public cache without snapshots when requested", () => {
    const selection = {
      id: "abc123",
      productIds: ["p1"],
      productSnapshots: [{ id: "p1", imageUrl: "https://example.com/a.jpg" }],
      title: "Test",
    };

    expect(compactSelectionForPublicCache(selection, { omitSnapshots: true })).toEqual({
      id: "abc123",
      productIds: ["p1"],
      title: "Test",
    });
  });

  it("sanitizes data urls for cache storage", () => {
    expect(sanitizeImageUrlForCache("data:image/png;base64,xyz")).toBe("");
    expect(sanitizeImageUrlForCache("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg"
    );
  });

  describe("savePublicCatalogCache", () => {
    beforeEach(() => {
      vi.stubGlobal("localStorage", createStorage());
      vi.stubGlobal("window", {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("stores compact selection and prunes older caches", () => {
      for (let index = 0; index < 12; index += 1) {
        localStorage.setItem(
          `${PUBLIC_CATALOG_CACHE_PREFIX}old-${index}`,
          JSON.stringify({
            id: `old-${index}`,
            updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
          })
        );
      }

      const selection = createCatalogSelectionPayload({
        title: "Nouvelle sélection",
        products: [product],
      });

      const result = savePublicCatalogCache(selection);
      expect(result.ok).toBe(true);

      let remaining = 0;
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(PUBLIC_CATALOG_CACHE_PREFIX)) remaining += 1;
      }
      expect(remaining).toBeLessThanOrEqual(8);
      expect(localStorage.getItem(`${PUBLIC_CATALOG_CACHE_PREFIX}${selection.id}`)).toBeTruthy();
    });

    it("falls back to metadata-only cache when quota is exceeded", () => {
      const backing = new Map();
      let calls = 0;
      const storage = {
        get length() {
          return backing.size;
        },
        key: (index) => Array.from(backing.keys())[index] ?? null,
        getItem: (key) => (backing.has(key) ? backing.get(key) : null),
        setItem: (key, value) => {
          calls += 1;
          if (calls === 1) {
            throw new DOMException("quota", "QuotaExceededError");
          }
          backing.set(key, String(value));
        },
        removeItem: (key) => {
          backing.delete(key);
        },
        clear: () => {
          backing.clear();
        },
      };
      vi.stubGlobal("localStorage", storage);

      const selection = createCatalogSelectionPayload({
        title: "Fallback",
        products: [product],
      });

      const result = savePublicCatalogCache(selection);
      expect(result.ok).toBe(true);
      expect(result.minimized).toBe(true);
    });
  });

  it("resolves size options from product or defaults", () => {
    expect(resolveProductSizeOptions(product)).toEqual(["S", "M", "L"]);
    expect(resolveProductSizeOptions({})).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"]);
  });

  it("resolves min quantity with fallback", () => {
    expect(resolveProductMinQuantity(product)).toBe(10);
    expect(resolveProductMinQuantity({})).toBe(1);
  });

  it("builds a French product sheet without prices", () => {
    const selection = { title: "Projet été 2026" };
    const productsById = new Map([[product.id, product]]);
    const text = buildCatalogProductSheet({
      selection,
      lines: [{ productId: "p1", color: "Noir", size: "M", quantity: 25 }],
      productsById,
      contact: { clientName: "Marie Dupont", clientEmail: "marie@example.com" },
    });

    expect(text).toContain("FICHE PRODUIT — Projet été 2026");
    expect(text).toContain("Client : Marie Dupont");
    expect(text).toContain("T-shirt Regent (SKU REG-001)");
    expect(text).toContain("Couleur : Noir");
    expect(text).toContain("Taille : M");
    expect(text).toContain("Quantité : 25");
    expect(text).not.toContain("Prix unitaire");
    expect(text).not.toContain("Source:");
  });

  it("resolves recipient email from selection settings", () => {
    expect(
      resolveCatalogRecipientEmail({
        settings: { companyEmail: "contact@accreation.fr" },
      })
    ).toBe("contact@accreation.fr");
    expect(
      resolveCatalogRecipientEmail({
        settings: { email: "info@accreation.fr" },
      })
    ).toBe("info@accreation.fr");
  });

  it("builds mailto url with subject and body", () => {
    const url = buildCatalogMailtoUrl({
      recipientEmail: "contact@accreation.fr",
      selection: { title: "Projet club" },
      bodyText: "Bonjour,\n\nMa sélection.",
    });
    expect(url).toContain("mailto:contact%40accreation.fr");
    expect(url).toContain("subject=");
    expect(url).toContain("Demande%20catalogue");
    expect(url).toContain("body=");
  });

  it("creates selection payload with settings snapshot", () => {
    const payload = createCatalogSelectionPayload({
      title: "Club sportif",
      products: [product],
      clientName: "AS Club",
      settings: { companyEmail: "hello@accreation.fr", companyName: "AC Creation" },
    });

    expect(payload.shareId).toBeTruthy();
    expect(payload.productIds).toEqual(["p1"]);
    expect(payload.settings.companyEmail).toBe("hello@accreation.fr");
    expect(payload.status).toBe("open");
  });
});
