import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  isAllowedLmdtUrl,
  parseProductCardsFromHtml,
  parseProductPath,
  parseListingMeta,
  slugToCategory,
} from "./lmdtParser.js";

describe("lmdtParser", () => {
  it("accepts lamaisonduteeshirt URLs only", () => {
    expect(isAllowedLmdtUrl("https://www.lamaisonduteeshirt.com/c-24-tee-shirts")).toBe(true);
    expect(isAllowedLmdtUrl("https://example.com/products")).toBe(false);
  });

  it("parses product path metadata", () => {
    expect(parseProductPath("/produits/tee-shirts/so-11380/regent")).toEqual({
      categorySlug: "tee-shirts",
      reference: "SO-11380",
      slug: "regent",
      category: "Tee-shirts",
      sourceUrl: "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
    });
  });

  it("reads listing totals from HTML", () => {
    const html = readFileSync("scripts/lmdt-sample.html", "utf8");
    expect(parseListingMeta(html)).toMatchObject({
      totalResults: 963,
      resultsPerPage: 16,
      totalPages: 61,
    });
  });

  it("extracts product cards from saved HTML sample", () => {
    const html = readFileSync("scripts/lmdt-sample.html", "utf8");
    const products = parseProductCardsFromHtml(html);
    expect(products.length).toBeGreaterThan(10);
    const regent = products.find((item) => item.sku === "SO-11380");
    expect(regent).toMatchObject({
      brand: "Sol's",
      productName: "Regent",
      priceHT: 1.77,
      priceTTC: 2.12,
      category: "Tee-shirts",
    });
    expect(regent.colors.length).toBeGreaterThan(5);
  });
});
