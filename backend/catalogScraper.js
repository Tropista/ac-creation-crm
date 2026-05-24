import axios from "axios";
import {
  classifyLmdtImageUrl,
  getNextPageUrl,
  hasNextPage,
  isAllowedLmdtUrl,
  isValidLmdtPackshotUrl,
  LMDT_PARSER_VERSION,
  normalizeLmdtUrl,
  parseColorItemsFromHtml,
  parseListingMeta,
  parseProductCardsFromHtml,
  pickProductDetailImageUrl,
} from "./lmdtParser.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function resolveFetchRetries(options = {}) {
  const parsed = Number(options.retries);
  const retries = Number.isFinite(parsed) ? parsed : 2;
  return Math.max(retries, 0);
}

async function fetchHtml(url, options = {}) {
  const retries = resolveFetchRetries(options);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { data } = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
        timeout: 30_000,
        maxRedirects: 5,
      });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("Impossible de récupérer la page.");
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function enrichProductsWithDetailImages(products, options = {}) {
  const fetchDetailImages = options.fetchDetailImages !== false;
  if (!fetchDetailImages || !products.length) return products;

  const detailConcurrency = Math.min(Math.max(Number(options.detailConcurrency) || 5, 1), 10);

  return mapWithConcurrency(products, detailConcurrency, async (product) => {
    if (!product?.sourceUrl) return product;

    try {
      const detailHtml = await fetchHtml(product.sourceUrl);
      const detailImageUrl = pickProductDetailImageUrl(detailHtml);
      if (!detailImageUrl || !isValidLmdtPackshotUrl(detailImageUrl)) {
        return { ...product, imageUrl: "" };
      }

      return {
        ...product,
        imageUrl: detailImageUrl,
      };
    } catch {
      return { ...product, imageUrl: "" };
    }
  });
}

export async function scrapeLmdtListing(rawUrl, options = {}) {
  const importAll = Boolean(options.importAll);
  let maxPages = Math.min(Math.max(Number(options.maxPages) || 1, 1), 100);
  let maxProducts = Math.min(Math.max(Number(options.maxProducts) || 200, 1), 2000);

  if (!isAllowedLmdtUrl(rawUrl)) {
    throw new Error("URL non autorisée. Seul lamaisonduteeshirt.com est supporté.");
  }

  let pageUrl = normalizeLmdtUrl(rawUrl);
  const allProducts = [];
  const seenUrls = new Set();
  let pagesScraped = 0;
  let listingMeta = { totalResults: 0, resultsPerPage: 16, totalPages: 0 };

  const firstHtml = await fetchHtml(pageUrl);
  listingMeta = parseListingMeta(firstHtml);

  if (importAll && listingMeta.totalPages > 0) {
    maxPages = listingMeta.totalPages;
    maxProducts = listingMeta.totalResults || maxProducts;
  }

  let html = firstHtml;

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) {
      html = await fetchHtml(pageUrl);
    }

    pagesScraped += 1;

    const pageProducts = parseProductCardsFromHtml(html, "https://www.lamaisonduteeshirt.com");
    for (const product of pageProducts) {
      if (seenUrls.has(product.sourceUrl)) continue;
      seenUrls.add(product.sourceUrl);
      allProducts.push(product);
      if (allProducts.length >= maxProducts) break;
    }

    if (allProducts.length >= maxProducts) break;
    if (!hasNextPage(html, pageUrl, pageProducts.length)) break;

    pageUrl = getNextPageUrl(html, pageUrl);
  }

  const products = await enrichProductsWithDetailImages(allProducts.slice(0, maxProducts), options);

  const annotatedProducts = products.map((product) => ({
    ...product,
    imageKind: classifyLmdtImageUrl(product.imageUrl),
  }));

  return {
    products: annotatedProducts,
    meta: {
      sourceUrl: normalizeLmdtUrl(rawUrl),
      pagesScraped,
      totalFound: allProducts.length,
      totalResults: listingMeta.totalResults,
      totalPages: listingMeta.totalPages,
      resultsPerPage: listingMeta.resultsPerPage,
      importAll,
      parserVersion: LMDT_PARSER_VERSION,
    },
  };
}

export async function refreshLmdtProductColors(sourceUrls = [], options = {}) {
  const urls = [...new Set((sourceUrls || []).filter(Boolean))].slice(0, 200);
  if (!urls.length) return [];

  const concurrency = Math.min(Math.max(Number(options.concurrency) || 5, 1), 10);

  return mapWithConcurrency(urls, concurrency, async (sourceUrl) => {
    if (!isAllowedLmdtUrl(sourceUrl)) {
      return { sourceUrl, error: "URL non autorisée." };
    }

    try {
      const detailHtml = await fetchHtml(sourceUrl);
      const colors = parseColorItemsFromHtml(detailHtml);
      if (!colors.length) {
        return {
          sourceUrl,
          colors: [],
          error: "Aucune couleur trouvée sur la fiche produit.",
        };
      }

      return { sourceUrl, colors };
    } catch (error) {
      return {
        sourceUrl,
        error: error?.message || "Impossible de lire la fiche produit.",
      };
    }
  });
}

export async function refreshLmdtProductImages(sourceUrls = [], options = {}) {
  const urls = [...new Set((sourceUrls || []).filter(Boolean))].slice(0, 200);
  if (!urls.length) return [];

  const concurrency = Math.min(Math.max(Number(options.concurrency) || 5, 1), 10);

  return mapWithConcurrency(urls, concurrency, async (sourceUrl) => {
    if (!isAllowedLmdtUrl(sourceUrl)) {
      return { sourceUrl, error: "URL non autorisée." };
    }

    try {
      const detailHtml = await fetchHtml(sourceUrl);
      const imageUrl = pickProductDetailImageUrl(detailHtml);
      if (!imageUrl || !isValidLmdtPackshotUrl(imageUrl)) {
        return {
          sourceUrl,
          imageUrl: null,
          imageKind: "none",
          error: "Packshot introuvable sur la fiche produit.",
        };
      }

      return {
        sourceUrl,
        imageUrl,
        imageKind: classifyLmdtImageUrl(imageUrl),
      };
    } catch (error) {
      return {
        sourceUrl,
        error: error?.message || "Impossible de lire la fiche produit.",
      };
    }
  });
}

export { resolveFetchRetries };
