import { describe, expect, it } from "vitest";
import {
  CATALOG_FOLDER_OTHER,
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
