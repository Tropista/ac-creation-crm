import { describe, expect, it } from "vitest";
import { promoteSupplierItemsToCollection } from "./catalogPromote.js";
import {
  CLIENT_CATALOG_KEY,
  SUPPLIER_CATALOG_KEY,
} from "./catalogCollections.js";

const supplierItem = {
  id: "sup-1",
  name: "Sol's Regent",
  sku: "SO-11380",
  category: "Tee-shirts",
  price: 1.77,
  priceTTC: 2.12,
  sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
  sourceProvider: "lamaisonduteeshirt",
  colors: ["blanc"],
  grammage: "145g/m²",
};

describe("catalogPromote", () => {
  it("copie des articles du pool fournisseur vers le catalogue client", () => {
    const { nextData, created } = promoteSupplierItemsToCollection(
      {
        supplierCatalogItems: [supplierItem],
        clientCatalogItems: [],
        products: [{ id: "p1", name: "Produit interne" }],
      },
      ["sup-1"],
      CLIENT_CATALOG_KEY
    );

    expect(created).toBe(1);
    expect(nextData.clientCatalogItems).toHaveLength(1);
    expect(nextData.clientCatalogItems[0].supplierItemId).toBe("sup-1");
    expect(nextData.products).toHaveLength(1);
    expect(nextData.supplierCatalogItems).toHaveLength(1);
  });
});
