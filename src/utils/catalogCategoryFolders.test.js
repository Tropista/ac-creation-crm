import { describe, expect, it } from "vitest";
import {
  CATALOG_AUDIENCE_UNISEXE,
  CATALOG_FOLDER_OTHER,
  resolveCatalogAudience,
  resolveCatalogFolder,
} from "./catalogCategoryFolders.js";

describe("catalogCategoryFolders", () => {
  it("maps LMDT categories to client folders", () => {
    expect(resolveCatalogFolder({ category: "Tee-shirts" })).toBe("T-shirt");
    expect(resolveCatalogFolder({ category: "Polos" })).toBe("Polos");
    expect(resolveCatalogFolder({ category: "Sweats" })).toBe("Sweats");
    expect(resolveCatalogFolder({ categorySlug: "casquettes" })).toBe("Casquettes");
    expect(resolveCatalogFolder({ category: "Vestes et manteaux" })).toBe("Vestes");
    expect(resolveCatalogFolder({ category: "Workwear" })).toBe("Workwear");
    expect(resolveCatalogFolder({ category: "Sport" })).toBe("Sport");
    expect(resolveCatalogFolder({ category: "Sacs" })).toBe("Bagagerie");
    expect(resolveCatalogFolder({ category: "Bagagerie" })).toBe("Bagagerie");
  });

  it("falls back to product name then Autre", () => {
    expect(resolveCatalogFolder({ name: "Casquette Trucker Pro" })).toBe("Casquettes");
    expect(resolveCatalogFolder({ name: "Article divers" })).toBe(CATALOG_FOLDER_OTHER);
  });

  it("uses sourceUrl slug when category is missing", () => {
    expect(
      resolveCatalogFolder({
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/polos/so-123/test",
      })
    ).toBe("Polos");
  });
});

describe("resolveCatalogAudience", () => {
  it("detects audience from product name", () => {
    expect(resolveCatalogAudience({ name: "T-shirt Stanley Stella Homme" })).toBe("Homme");
    expect(resolveCatalogAudience({ name: "Polo Femme Bio" })).toBe("Femme");
    expect(resolveCatalogAudience({ name: "Sweat Junior Enfant" })).toBe("Enfant");
    expect(resolveCatalogAudience({ name: "T-shirt Unisexe Premium" })).toBe(CATALOG_AUDIENCE_UNISEXE);
  });

  it("detects audience from LMDT category and sourceUrl slug", () => {
    expect(resolveCatalogAudience({ category: "Tee-shirts Homme" })).toBe("Homme");
    expect(resolveCatalogAudience({ category: "Polos Femme" })).toBe("Femme");
    expect(
      resolveCatalogAudience({
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts-enfant/so-123/test",
      })
    ).toBe("Enfant");
    expect(
      resolveCatalogAudience({
        sourceUrl: "https://www.lamaisonduteeshirt.com/produits/sweats-ladies/so-456/test",
      })
    ).toBe("Femme");
  });

  it("defaults to Unisexe when unclear or mixed gender", () => {
    expect(resolveCatalogAudience({ name: "T-shirt Stanley Stella Creator" })).toBe(
      CATALOG_AUDIENCE_UNISEXE
    );
    expect(
      resolveCatalogAudience({ name: "Pack Homme et Femme Promo" })
    ).toBe(CATALOG_AUDIENCE_UNISEXE);
  });

  it("recognizes English kid keywords", () => {
    expect(resolveCatalogAudience({ name: "Hoodie Kids Collection" })).toBe("Enfant");
    expect(resolveCatalogAudience({ name: "Baby Bodysuit Soft" })).toBe("Enfant");
  });
});
