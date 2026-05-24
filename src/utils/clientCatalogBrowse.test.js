import { describe, expect, it } from "vitest";
import {
  buildPageNumbers,
  CLIENT_CATALOG_PAGE_SIZE,
  CRM_CATALOG_PAGE_SIZE,
  filterProductsByAudience,
  filterProductsByFolder,
  getTotalPages,
  paginateItems,
} from "./clientCatalogBrowse.js";
import { resolveCatalogAudience, resolveCatalogFolder } from "./catalogCategoryFolders.js";

describe("clientCatalogBrowse", () => {
  const products = [
    { id: "1", category: "Tee-shirts", name: "Tee A Homme" },
    { id: "2", category: "Polos", name: "Polo B Femme" },
    { id: "3", category: "Polos", name: "Polo C" },
    { id: "4", category: "Sweats", name: "Sweat Enfant D" },
  ];

  it("filterProductsByFolder returns all when filter is empty", () => {
    expect(filterProductsByFolder(products, "", resolveCatalogFolder)).toHaveLength(4);
  });

  it("filterProductsByFolder filters by resolved folder", () => {
    const polos = filterProductsByFolder(products, "Polos", resolveCatalogFolder);
    expect(polos).toHaveLength(2);
    expect(polos.map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("filterProductsByAudience filters by resolved audience", () => {
    const hommes = filterProductsByAudience(products, "Homme", resolveCatalogAudience);
    expect(hommes.map((item) => item.id)).toEqual(["1", "3"]);

    const enfants = filterProductsByAudience(products, "Enfant", resolveCatalogAudience);
    expect(enfants.map((item) => item.id)).toEqual(["4"]);
  });

  it("filterProductsByAudience returns all when filter is empty", () => {
    expect(filterProductsByAudience(products, "", resolveCatalogAudience)).toHaveLength(4);
  });

  it("paginateItems returns 15 items per page", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ id: String(index) }));
    expect(paginateItems(many, 1)).toHaveLength(CLIENT_CATALOG_PAGE_SIZE);
    expect(paginateItems(many, 2)).toHaveLength(5);
  });

  it("CRM_CATALOG_PAGE_SIZE paginates CRM grid", () => {
    const many = Array.from({ length: 50 }, (_, index) => ({ id: String(index) }));
    expect(paginateItems(many, 1, CRM_CATALOG_PAGE_SIZE)).toHaveLength(CRM_CATALOG_PAGE_SIZE);
    expect(paginateItems(many, 3, CRM_CATALOG_PAGE_SIZE)).toHaveLength(2);
  });

  it("getTotalPages computes page count", () => {
    expect(getTotalPages(0)).toBe(1);
    expect(getTotalPages(15)).toBe(1);
    expect(getTotalPages(16)).toBe(2);
    expect(getTotalPages(45)).toBe(3);
  });

  it("buildPageNumbers returns a sliding window", () => {
    expect(buildPageNumbers(1, 1)).toEqual([]);
    expect(buildPageNumbers(3, 10, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPageNumbers(8, 10, 5)).toEqual([6, 7, 8, 9, 10]);
  });
});
