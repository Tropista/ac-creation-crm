import { describe, expect, it } from "vitest";
import { filterMenuGroupsBySettings } from "./sidebarMenu.js";

const menuGroups = [
  { id: "commercial", label: "Commercial", items: [] },
  { id: "catalogues", label: "Catalogues", items: [] },
  { id: "catalogue", label: "Catalogue", items: [] },
];

describe("filterMenuGroupsBySettings", () => {
  it("conserve la section Catalogues quand hideCatalogMenu est false", () => {
    const filtered = filterMenuGroupsBySettings(menuGroups, { hideCatalogMenu: false });

    expect(filtered.map((group) => group.id)).toEqual([
      "commercial",
      "catalogues",
      "catalogue",
    ]);
  });

  it("masque la section Catalogues quand hideCatalogMenu est true", () => {
    const filtered = filterMenuGroupsBySettings(menuGroups, { hideCatalogMenu: true });

    expect(filtered.map((group) => group.id)).toEqual(["commercial", "catalogue"]);
  });

  it("ne masque pas la section Catalogue (produits) quand hideCatalogMenu est true", () => {
    const filtered = filterMenuGroupsBySettings(menuGroups, { hideCatalogMenu: true });

    expect(filtered.some((group) => group.id === "catalogue")).toBe(true);
    expect(filtered.some((group) => group.id === "catalogues")).toBe(false);
  });
});
