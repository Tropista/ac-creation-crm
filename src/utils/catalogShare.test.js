import { describe, expect, it } from "vitest";
import {
  buildCatalogMailtoUrl,
  buildCatalogProductSheet,
  buildProductSnapshots,
  createCatalogSelectionPayload,
  resolveCatalogRecipientEmail,
  resolveProductMinQuantity,
  resolveProductSizeOptions,
} from "./catalogShare";

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
