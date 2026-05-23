const ALLOWED_HOSTS = new Set(["www.lamaisonduteeshirt.com", "lamaisonduteeshirt.com"]);

export function isAllowedLmdtUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeLmdtUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  if (!url.searchParams.has("page")) {
    url.searchParams.delete("page");
  }
  return url.toString().replace(/\/$/, "");
}

export function decodeHtmlText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePriceParts(chunk) {
  const htMatch = chunk.match(
    /<span class="price "\s*data-mobile-title="[^"]*">\s*<span>\s*(\d+),<sup>(\d+)<\/sup>/i
  );
  const ttcMatch = chunk.match(
    /<span class="price taxedPrice[^"]*"[\s\S]*?<span>\s*(\d+),<sup>(\d+)<\/sup>/i
  );

  const priceHT = htMatch ? Number(`${htMatch[1]}.${htMatch[2]}`) : 0;
  const priceTTC = ttcMatch ? Number(`${ttcMatch[1]}.${ttcMatch[2]}`) : 0;
  return { priceHT, priceTTC };
}

export function slugToCategory(slug = "") {
  const map = {
    "tee-shirts": "Tee-shirts",
    polos: "Polos",
    sweats: "Sweats",
    pulls: "Pulls",
    chemises: "Chemises",
    pantalons: "Pantalons",
    "sacs-shopping": "Sacs",
    "bonnets-echarpes-gants": "Bonnets & accessoires",
  };
  if (map[slug]) return map[slug];
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseProductPath(pathname = "") {
  const match = String(pathname).match(/\/produits\/([^/]+)\/([^/]+)\/([^/?#]+)/i);
  if (!match) {
    return { categorySlug: "", reference: "", slug: "", sourceUrl: pathname };
  }

  const [, categorySlug, reference, slug] = match;
  return {
    categorySlug,
    reference: reference.toUpperCase(),
    slug,
    category: slugToCategory(categorySlug),
    sourceUrl: `https://www.lamaisonduteeshirt.com${pathname.split("?")[0]}`,
  };
}

export function parseProductCardsFromHtml(html, baseUrl = "https://www.lamaisonduteeshirt.com") {
  const cards = String(html).split('<div class="product-card-main">').slice(1);
  const products = [];
  const seen = new Set();

  for (const rawCard of cards) {
    const chunk = rawCard.split("</div>\n</div>")[0] || rawCard;
    const hrefMatch = chunk.match(/<a class="product-card[^"]*" href="([^"?]+)/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1];
    if (seen.has(href)) continue;
    seen.add(href);

    const pathInfo = parseProductPath(href);
    const brandMatch = chunk.match(/<span class="brand-name">([\s\S]*?)<\/span>/i);
    const nameMatch = chunk.match(/<span class="product-name">([\s\S]*?)<\/span>/i);
    const imageMatch = chunk.match(/class="image-product"[^>]+src="([^"]+)"/i);
    const grammageMatch = chunk.match(/<span class="grammage">([^<]+)</i);
    const minQtyMatch = chunk.match(/class="price-explain"[\s\S]*?<span>x(\d+)<\/span>/i);
    const colorsMatch = chunk.match(/class="colors-btn"[\s\S]*?>\s*(\d+)/i);

    const brand = decodeHtmlText(brandMatch?.[1] || "");
    const productName = decodeHtmlText(nameMatch?.[1] || "");
    const { priceHT, priceTTC } = parsePriceParts(chunk);

    const colors = [...chunk.matchAll(/class="color-item"[^>]+title="([^"]+)"/gi)].map(
      (match) => decodeHtmlText(match[1]).replace(/_/g, " ")
    );

    products.push({
      name: [brand, productName].filter(Boolean).join(" "),
      brand,
      productName,
      sku: pathInfo.reference,
      category: pathInfo.category,
      categorySlug: pathInfo.categorySlug,
      priceHT,
      priceTTC,
      grammage: decodeHtmlText(grammageMatch?.[1] || ""),
      minOrderQty: minQtyMatch ? Number(minQtyMatch[1]) : 0,
      colorCount: colorsMatch ? Number(colorsMatch[1]) : colors.length,
      colors,
      imageUrl: imageMatch?.[1] || "",
      sourceUrl: pathInfo.sourceUrl || `${baseUrl}${href}`,
      sourceProvider: "lamaisonduteeshirt",
    });
  }

  return products;
}

export function getNextPageUrl(html, currentUrl) {
  const url = new URL(currentUrl);
  const currentPage = Number(url.searchParams.get("page") || 1);
  const nextHrefMatch = html.match(/<link rel="next" href="([^"]+)"/i);
  if (nextHrefMatch) {
    return nextHrefMatch[1];
  }

  url.searchParams.set("page", String(currentPage + 1));
  return url.toString();
}

export function hasNextPage(html, currentUrl, foundProducts) {
  if (!foundProducts) return false;
  const nextHrefMatch = html.match(/<link rel="next" href="([^"]+)"/i);
  return Boolean(nextHrefMatch);
}

export function parseListingMeta(html) {
  const htmlStr = String(html);
  const idMatch = htmlStr.match(/id="nb_resultats"[^>]*>\s*(\d+)/i);
  const totalMatch =
    idMatch ||
    htmlStr.match(/(\d+)\s*r(?:é|e|&#233;)sultat/i) ||
    htmlStr.match(/(\d+)\s*result/i);
  const perPageMatch =
    htmlStr.match(/(\d+)\s*articles\/page/i) ||
    htmlStr.match(/nb_par_page=(\d+)/i);

  const totalResults = totalMatch ? Number(totalMatch[1]) : 0;
  const resultsPerPage = perPageMatch ? Number(perPageMatch[1]) : 16;
  const totalPages = totalResults
    ? Math.max(1, Math.ceil(totalResults / resultsPerPage))
    : 0;

  return { totalResults, resultsPerPage, totalPages };
}
