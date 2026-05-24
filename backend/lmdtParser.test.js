import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  decodeLmdtMediaPath,
  isAllowedLmdtUrl,
  isLmdtModelImagePath,
  parseProductCardsFromHtml,
  parseProductPath,
  parseListingMeta,
  pickBestProductImageFromCard,
  scoreLmdtImageUrl,
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
    expect(regent.imageUrl).toContain("greybg");
    expect(decodeLmdtMediaPath(regent.imageUrl)).toContain("p-blank");
  });

  it("prefers packshot image-product over model image in card", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xODAxNC53ZWJw";
    const model =
      "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xODAxNC8xODAxNC0yMDczMy0xLmpwZw";

    const cardHtml = `
      <div class="img-container">
        <img class="image-model" src="${model}" alt="Portrait modèle"/>
        <img class="image-product" src="${packshot}" alt="Image produit Polo Pro"/>
      </div>
      <a class="color-item" data-image="${model}"></a>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
    expect(scoreLmdtImageUrl(packshot, { cssClass: "image-product", alt: "Image produit Polo Pro" }))
      .toBeGreaterThan(scoreLmdtImageUrl(model, { cssClass: "image-model", alt: "Portrait modèle" }));
  });

  it("supports image tags where src appears before class", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xODAxNC53ZWJw";
    const cardHtml = `
      <div class="img-container">
        <img src="${packshot}" loading="eager" class="image-product" alt="Image produit Polo Pro"/>
      </div>
    `;
    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
  });

  it("rejects model color-variant paths from swatch data-image", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/rquNhqAwVOhMyeS-R8TMVu5uiorusPyXvVzgZn5srGk/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNTM4MS53ZWJw";
    const modelSwatch =
      "https://media.lamaisonduteeshirt.com/uU73t0dQtA8YIHs3qNxM4uj5pyoeSAM2jDeiyYpky4c/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNTM4MS8xNTM4MS0xNzIzNy0xLmpwZw";

    expect(isLmdtModelImagePath(modelSwatch)).toBe(true);
    expect(isLmdtModelImagePath(packshot)).toBe(false);

    const cardHtml = `
      <div class="img-container">
        <img class="image-model" src="${modelSwatch}" alt="Portrait modèle"/>
      </div>
      <a class="color-item" data-image="${modelSwatch}"></a>
    `;
    expect(pickBestProductImageFromCard(cardHtml)).toBe("");
  });

  it("picks Anthem packshot over color swatch model faces", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/rquNhqAwVOhMyeS-R8TMVu5uiorusPyXvVzgZn5srGk/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNTM4MS53ZWJw";
    const modelSwatch =
      "https://media.lamaisonduteeshirt.com/uU73t0dQtA8YIHs3qNxM4uj5pyoeSAM2jDeiyYpky4c/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNTM4MS8xNTM4MS0xNzIzNy0xLmpwZw";

    const cardHtml = `
      <div class="img-container">
        <img loading="eager" class="image-product" src="${packshot}" alt="Image produit T-shirt homme Anthem"/>
        <img loading="eager" class="badge-brand" src="https://media.lamaisonduteeshirt.com/logo.png" alt="Anthem"/>
      </div>
      <a class="color-item" data-image="${modelSwatch}" title="black"></a>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
    expect(decodeLmdtMediaPath(packshot)).toContain("p-blank-TH");
  });

  it("picks Armor-Lux marinière packshot over worn variant swatch", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/XV0YBCCjum9RYsbsSBmSVkHi67UqCS8gfzFuAMsNMOM/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1NVC8yLmpwZw";
    const wornVariant =
      "https://media.lamaisonduteeshirt.com/hHG75FuvG7CKRg7mro_V6WoSO803cg-TDO1191ag0BE/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xMTIwMC8xMTIwMC0zLTEuanBn";

    const cardHtml = `
      <div class="img-container">
        <img loading="eager" class="image-product" src="${packshot}" alt="Image produit Marinière manches longues Loctudy"/>
        <img loading="eager" class="badge-brand" src="https://media.lamaisonduteeshirt.com/logo.png" alt="Armor-Lux"/>
      </div>
      <a class="color-item" data-image="${wornVariant}" title="blanc/navire"></a>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
    expect(decodeLmdtMediaPath(packshot)).toContain("/p-MT/");
  });

  it("picks Asquith & Fox marinière packshot over swatch model photo", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/Jr7j6Wki6XdUwzri9Zdo33yBe9LCPAC-UCkF95aPvZQ/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1NVC8xNjg3MS5qcGc";
    const modelSwatch =
      "https://media.lamaisonduteeshirt.com/B3m4xjF2twc09t2_htAaf9DxNLMEK-fZZXNkY7f-sl0/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNjg3MS8xNjg3MS0xODk2NC0xLmpwZw";

    const cardHtml = `
      <div class="img-container">
        <img loading="eager" class="image-product" src="${packshot}" alt="Image produit T-shirt marinière coastal homme"/>
        <img loading="eager" class="badge-brand" src="https://media.lamaisonduteeshirt.com/logo.png" alt="Asquith & Fox"/>
      </div>
      <a class="color-item" data-image="${modelSwatch}" title="white/navy"></a>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
    expect(isLmdtModelImagePath(modelSwatch)).toBe(true);
  });

  it("ignores badge-brand and non-product imgs inside img-container", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzgwLndlYnA";
    const brandLogo =
      "https://media.lamaisonduteeshirt.com/cy3kMUAdQNgvlgihX3cQlwK_oROWgeAB4yIzKl1SoPQ/pr:brand70x70/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvbS9sb2dvLXNvbHMucG5n";

    const cardHtml = `
      <div class="img-container">
        <img loading="eager" class="image-product" src="${packshot}" alt="Image produit Regent"/>
        <img loading="eager" class="badge-brand" src="${brandLogo}" alt="Sol's"/>
      </div>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
  });
});
