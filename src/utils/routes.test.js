import { describe, expect, it } from "vitest";
import { PAGE_PATHS, pathToPage } from "./routes.js";

describe("routes CRM", () => {
  it("ne publie plus les routes des configurateurs produit", () => {
    expect(PAGE_PATHS).not.toHaveProperty("vue3d");
    expect(PAGE_PATHS).not.toHaveProperty("tshirt3d");
    expect(pathToPage("/vue-3d")).toBeNull();
    expect(pathToPage("/t-shirt-3d")).toBeNull();
    expect(pathToPage("/configurateur-tshirt")).toBeNull();
  });

  it("conserve les routes métier du CRM", () => {
    expect(PAGE_PATHS).toMatchObject({
      clients: "/clients",
      quotes: "/devis",
      invoices: "/factures",
      banque: "/banque",
      atelier: "/atelier",
      print3dcalc: "/calculateur-3d",
    });
  });
});
