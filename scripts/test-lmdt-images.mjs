import axios from "axios";
import {
  classifyLmdtImageUrl,
  collectProductGalleryImageUrls,
  decodeLmdtMediaPath,
  isLmdtModelImagePath,
  isValidLmdtPackshotUrl,
  parseProductCardsFromHtml,
  parseProductDetailHeroImageUrl,
  pickBestProductImageFromCard,
  pickProductDetailImageUrl,
} from "../backend/lmdtParser.js";
import { scrapeLmdtListing } from "../backend/catalogScraper.js";

const SKUS = ["SO-11380", "SO-11939", "BC-TU03T", "GI-5000", "SO-11381"];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
    timeout: 30_000,
  });
  return data;
}

function summarize(url = "") {
  const decoded = decodeLmdtMediaPath(url);
  return {
    decoded: decoded.split("/").slice(-3).join("/"),
    kind: classifyLmdtImageUrl(url),
    validPackshot: isValidLmdtPackshotUrl(url),
    isModel: isLmdtModelImagePath(url),
    greybg: String(url).includes("greybg"),
  };
}

function printCandidates(label, urls = []) {
  console.log(`  ${label}:`);
  for (const [index, url] of urls.entries()) {
    console.log(`    [${index}]`, summarize(url));
  }
}

console.log("=== Live listing (page 1) ===");
const listingHtml = await fetchHtml("https://www.lamaisonduteeshirt.com/c-24-tee-shirts");
const listingProducts = parseProductCardsFromHtml(listingHtml);

for (const sku of SKUS) {
  const product = listingProducts.find((item) => item.sku === sku);
  if (!product) {
    console.log(`\n${sku}: not on page 1`);
    continue;
  }

  console.log(`\n=== ${sku} ${product.name} ===`);
  const cardChunk = listingHtml.split('<div class="product-card-main">').find((chunk) =>
    chunk.includes(product.sourceUrl.replace("https://www.lamaisonduteeshirt.com", ""))
  );
  const listingCardImage = pickBestProductImageFromCard(cardChunk || "");
  console.log("parseProductCardsFromHtml.imageUrl:", summarize(product.imageUrl || "(empty)"));
  console.log("listing card image-product:", summarize(listingCardImage));

  const detailHtml = await fetchHtml(product.sourceUrl);
  const hero = parseProductDetailHeroImageUrl(detailHtml);
  const picked = pickProductDetailImageUrl(detailHtml);
  const gallery = collectProductGalleryImageUrls(detailHtml);

  console.log("#photo_produit src:", summarize(hero));
  console.log("pickProductDetailImageUrl:", summarize(picked));
  printCandidates("gallery swiper", gallery.slice(0, 5));
}

console.log("\n=== Full scrape pipeline (Regent assert) ===");
const result = await scrapeLmdtListing("https://www.lamaisonduteeshirt.com/c-24-tee-shirts", {
  maxPages: 1,
  maxProducts: 20,
});
console.log("parserVersion:", result.meta?.parserVersion);

for (const sku of SKUS) {
  const product = result.products.find((item) => item.sku === sku);
  if (!product) continue;
  console.log(sku, {
    imageKind: product.imageKind,
    ...summarize(product.imageUrl || ""),
  });
}

const regent = result.products.find((item) => item.sku === "SO-11380");
const regentPath = decodeLmdtMediaPath(regent?.imageUrl || "");
if (!regentPath.includes("/p-blank-TH/1780.webp") || regentPath.includes("1780-3104")) {
  console.error("ASSERT FAILED: Regent imageUrl", regentPath);
  process.exitCode = 1;
} else {
  console.log("ASSERT OK: Regent -> p-blank-TH/1780.webp");
}
