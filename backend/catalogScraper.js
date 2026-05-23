import axios from "axios";
import {
  getNextPageUrl,
  hasNextPage,
  isAllowedLmdtUrl,
  normalizeLmdtUrl,
  parseListingMeta,
  parseProductCardsFromHtml,
} from "./lmdtParser.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
    timeout: 30_000,
    maxRedirects: 5,
  });
  return data;
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

  return {
    products: allProducts.slice(0, maxProducts),
    meta: {
      sourceUrl: normalizeLmdtUrl(rawUrl),
      pagesScraped,
      totalFound: allProducts.length,
      totalResults: listingMeta.totalResults,
      totalPages: listingMeta.totalPages,
      resultsPerPage: listingMeta.resultsPerPage,
      importAll,
    },
  };
}
