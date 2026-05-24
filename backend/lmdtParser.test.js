import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  collectProductGalleryImageUrls,
  decodeLmdtMediaPath,
  isAllowedLmdtUrl,
  isLmdtModelImagePath,
  parseColorItemsFromHtml,
  parseProductCardsFromHtml,
  parseProductDetailHeroImageUrl,
  parseProductPath,
  parseListingMeta,
  pickBestProductImageFromCard,
  pickProductDetailImageUrl,
  PICK_GALLERY_IMAGE_INDEX,
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
    expect(regent.imageUrl).toBe("");
  });

  it("extracts color names and hex from color-item swatches", () => {
    const html = `
      <a class="color-item" href="/produits/test" title="french_marine" style="background-color: #092a44;"></a>
      <a class="color-item" href="/produits/test" title="blanc" style="background-color: #ffffff;"></a>
    `;
    expect(parseColorItemsFromHtml(html)).toEqual([
      { name: "french marine", hex: "#092a44" },
      { name: "blanc", hex: "#ffffff" },
    ]);
  });

  it("extracts data-image URL per color swatch", () => {
    const modelImage =
      "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzgwLzE3ODAtMzEwNC0xLndlYnA";
    const html = `
      <a class="color-item" href="/produits/test" data-image="${modelImage}" title="blanc" style="background-color: #ffffff;"></a>
    `;
    expect(parseColorItemsFromHtml(html)).toEqual([
      { name: "blanc", hex: "#ffffff", imageUrl: modelImage },
    ]);
  });

  it("live Regent listing swatches include per-color imageUrl", () => {
    const listingHtml = readFileSync("scripts/lmdt-listing-live.html", "utf8");
    const regentCard = listingHtml.split('<div class="product-card-main">').find((chunk) =>
      /class="product-card[^"]*" href="[^"]*so-11380/i.test(chunk)
    );
    const colors = parseColorItemsFromHtml(regentCard || "");
    const blanc = colors.find((color) => typeof color === "object" && color.name === "blanc");

    expect(blanc?.imageUrl).toContain("media.lamaisonduteeshirt.com");
    expect(decodeLmdtMediaPath(blanc?.imageUrl || "")).toContain("1780-3104-1");
  });

  it("live Regent detail page swatches include per-color imageUrl", () => {
    const productHtml = readFileSync("scripts/lmdt-regent-live.html", "utf8");
    const colors = parseColorItemsFromHtml(productHtml);
    const blanc = colors.find((color) => typeof color === "object" && color.name === "blanc");

    expect(colors.length).toBeGreaterThan(10);
    expect(blanc?.imageUrl).toContain("media.lamaisonduteeshirt.com");
    expect(decodeLmdtMediaPath(blanc?.imageUrl || "")).toContain("1780-3104-1");
  });

  it("listing cards still expose packshots via pickBestProductImageFromCard", () => {
    const html = readFileSync("scripts/lmdt-sample.html", "utf8");
    const chunk = html.split('<div class="product-card-main">').slice(1)[0];
    const imageUrl = pickBestProductImageFromCard(chunk);
    expect(imageUrl).toContain("greybg");
    expect(decodeLmdtMediaPath(imageUrl)).toContain("p-blank");
  });

  it("prefers packshot image-product over model image-product in card order", () => {
    const modelProduct =
      "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xODAxNC8xODAxNC0yMDczMy0xLmpwZw";
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xODAxNC53ZWJw";

    const cardHtml = `
      <div class="img-container">
        <img loading="eager" class="image-product" src="${modelProduct}" alt="Image produit modèle"/>
        <img loading="eager" class="image-product" src="${packshot}" alt="Image produit Polo Pro"/>
        <img loading="eager" class="badge-brand" src="https://media.lamaisonduteeshirt.com/logo.png" alt="Sol's"/>
      </div>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
    expect(isLmdtModelImagePath(modelProduct)).toBe(true);
  });

  it("falls back to first image-product when only one exists in img-container", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xODAxNC53ZWJw";

    const cardHtml = `
      <div class="img-container">
        <img loading="eager" class="image-product" src="${packshot}" alt="Image produit Polo Pro"/>
        <img loading="eager" class="badge-brand" src="https://media.lamaisonduteeshirt.com/logo.png" alt="Sol's"/>
      </div>
    `;

    expect(pickBestProductImageFromCard(cardHtml)).toBe(packshot);
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

  it("collects product detail gallery slides in DOM order (live Sporty snippet)", () => {
    const productHtml = readFileSync("scripts/lmdt-product-sporty-live.html", "utf8");
    const gallery = collectProductGalleryImageUrls(productHtml);

    expect(gallery.length).toBeGreaterThan(10);
    expect(PICK_GALLERY_IMAGE_INDEX).toBe(0);
    expect(decodeLmdtMediaPath(gallery[0])).toContain("/p-blank-TH/3128.webp");
    const firstModel = gallery.find((url) => isLmdtModelImagePath(url));
    expect(decodeLmdtMediaPath(firstModel || "")).toContain("/3128/3128-3104-1.");
    expect(isLmdtModelImagePath(firstModel)).toBe(true);
  });

  it("live Regent: gallery index 0 is packshot, index 1 is model worn shot", () => {
    const productHtml = readFileSync("scripts/lmdt-regent-live.html", "utf8");
    const gallery = collectProductGalleryImageUrls(productHtml);

    expect(decodeLmdtMediaPath(gallery[0])).toContain("/p-blank-TH/1780.webp");
    const firstModel = gallery.find((url) => isLmdtModelImagePath(url));
    expect(decodeLmdtMediaPath(firstModel || "")).toContain("/1780/1780-3104-1.");
    expect(isLmdtModelImagePath(firstModel)).toBe(true);
  });

  it("live Regent: always picks #photo_produit packshot, not gallery model slide", () => {
    const productHtml = readFileSync("scripts/lmdt-regent-live.html", "utf8");
    const heroImage = parseProductDetailHeroImageUrl(productHtml);
    const imageUrl = pickProductDetailImageUrl(productHtml);
    const gallery = collectProductGalleryImageUrls(productHtml);

    expect(heroImage).toContain("greybg");
    expect(decodeLmdtMediaPath(heroImage)).toContain("/p-blank-TH/1780.webp");
    expect(imageUrl).toBe(heroImage);
    expect(imageUrl).not.toBe(gallery[1]);
    expect(decodeLmdtMediaPath(imageUrl)).not.toContain("-3104-1");
  });

  it("reads hero packshot from photo_produit on live Sporty page", () => {
    const productHtml = readFileSync("scripts/lmdt-product-sporty-live.html", "utf8");
    const heroImage = parseProductDetailHeroImageUrl(productHtml);

    expect(heroImage).toContain("greybg");
    expect(decodeLmdtMediaPath(heroImage)).toContain("/p-blank-TH/3128.webp");
  });

  it("prefers packshot when gallery index 1 is a model shot (live Sporty page)", () => {
    const productHtml = readFileSync("scripts/lmdt-product-sporty-live.html", "utf8");
    const imageUrl = pickProductDetailImageUrl(productHtml);

    expect(imageUrl).toContain("greybg");
    expect(decodeLmdtMediaPath(imageUrl)).toContain("p-blank-TH");
    expect(isLmdtModelImagePath(imageUrl)).toBe(false);
  });

  it("rejects Gildan worn shots under /c/p/{id}/{id}-{color}-1.jpg", () => {
    const packshot =
      "https://media.lamaisonduteeshirt.com/PsLwCXPdq8EEpxCUSGDfJCIdsgL6wEBdO3O5aCpU6UM/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzUud2VicA";
    const wornModel =
      "https://media.lamaisonduteeshirt.com/def/pr:580x580/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzUvMTc1LTE5OS0xLmpwZw";

    expect(isLmdtModelImagePath(wornModel)).toBe(true);
    expect(isLmdtModelImagePath(packshot)).toBe(false);

    const productHtml = `
      <img id="photo_produit" src="${packshot}" />
      <div id="swiper-product-images" class="swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide"><a data-link="${packshot}"></a></div>
          <div class="swiper-slide"><a data-link="${wornModel}"></a></div>
        </div>
      </div>
    `;

    expect(pickProductDetailImageUrl(productHtml)).toBe(packshot);
  });

  it("rejects model photo_produit src and falls back to galleryLien-main data-src", () => {
    const modelHero =
      "https://media.lamaisonduteeshirt.com/def/pr:580x580/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzgwLzE3ODAtMzEwNC0xLndlYnA";
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:580x580greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzgwLndlYnA";

    const productHtml = `
      <img id="photo_produit" src="${modelHero}" />
      <div id="swiper-product-images" class="swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide galleryLien-main galleryLien-image">
            <a data-src="${packshot}" data-link="${modelHero}"></a>
          </div>
        </div>
      </div>
    `;

    expect(pickProductDetailImageUrl(productHtml)).toBe(packshot);
  });

  it("returns empty when only model shots are available", () => {
    const model =
      "https://media.lamaisonduteeshirt.com/def/pr:580x580/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzgwLzE3ODAtMzEwNC0xLndlYnA";

    const productHtml = `
      <img id="photo_produit" src="${model}" />
      <div id="swiper-product-images" class="swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide galleryLiens galleryLien-image galleryLien-color">
            <a data-src="${model}" data-link="${model}"></a>
          </div>
        </div>
      </div>
    `;

    expect(pickProductDetailImageUrl(productHtml)).toBe("");
  });

  it("prefers hero packshot even when galleryLien-main data-link is a model shot", () => {
    const modelProduct =
      "https://media.lamaisonduteeshirt.com/def/pr:580x580/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xODAxNC8xODAxNC0yMDczMy0xLmpwZw";
    const packshot =
      "https://media.lamaisonduteeshirt.com/abc/pr:1920greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xODAxNC53ZWJw";

    const productHtml = `
      <img id="photo_produit" src="${packshot}" />
      <div id="swiper-product-images" class="swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide galleryLien-main galleryLien-image">
            <a data-link="${modelProduct}"></a>
          </div>
          <div class="swiper-slide galleryLiens galleryLien-image galleryLien-color galleryLien-3104">
            <a data-link="${packshot}"></a>
          </div>
        </div>
      </div>
    `;

    expect(pickProductDetailImageUrl(productHtml)).toBe(packshot);
  });

  it("live listing cards: parseProductCardsFromHtml skips listing images", () => {
    const listingHtml = readFileSync("scripts/lmdt-listing-live.html", "utf8");
    const products = parseProductCardsFromHtml(listingHtml);
    const sporty = products.find((item) => item.sku === "SO-11939");

    expect(products.length).toBe(16);
    expect(products.every((item) => !item.imageUrl)).toBe(true);
    expect(sporty?.sku).toBe("SO-11939");
  });

  it("live listing card HTML still contains packshot image-product", () => {
    const listingHtml = readFileSync("scripts/lmdt-listing-live.html", "utf8");
    const products = parseProductCardsFromHtml(listingHtml);
    const sportyCard = listingHtml.split('<div class="product-card-main">').find((chunk) =>
      /so-11939/i.test(chunk)
    );
    const imageUrl = pickBestProductImageFromCard(sportyCard || "");

    expect(decodeLmdtMediaPath(imageUrl)).toContain("/p-blank-TH/3128.webp");
    expect(isLmdtModelImagePath(imageUrl)).toBe(false);
    expect(products.find((item) => item.sku === "SO-11939")?.imageUrl).toBe("");
  });
});
