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

export function decodeLmdtMediaPath(url = "") {
  const match = String(url).match(/\/aHR0c[^/?]+/);
  if (!match) return "";
  try {
    return Buffer.from(match[0].slice(1), "base64url").toString("utf8");
  } catch {
    try {
      return Buffer.from(match[0].slice(1), "base64").toString("utf8");
    } catch {
      return "";
    }
  }
}

const MODEL_PATH_HINTS =
  /(?:^|[/_-])(model|modele|look|lookbook|portrait|worn|mannequin|face|tete|head|wear)(?:[/_-]|$)/i;
const PRODUCT_PATH_HINTS =
  /(?:^|[/_-])(p-blank|p-mt|packshot|product|ghost|flat|blank)(?:[/_-]|$)/i;
/** Color swatch / model worn shots: /c/15381/15381-17237-1.jpg */
const MODEL_COLOR_VARIANT_PATH = /\/c\/\d+\/\d+-\d+-\d+\.(jpe?g|webp)/i;

export function isLmdtModelImagePath(url = "") {
  const decoded = decodeLmdtMediaPath(url).toLowerCase();
  if (!decoded) return false;
  if (MODEL_COLOR_VARIANT_PATH.test(decoded)) return true;
  if (MODEL_PATH_HINTS.test(decoded)) return true;
  if (/-\d{4,}-\d+\.(jpe?g|webp)/i.test(decoded)) return true;
  return false;
}

export function scoreLmdtImageUrl(url = "", meta = {}) {
  const raw = String(url).trim();
  if (!raw) return -1000;

  const decoded = decodeLmdtMediaPath(raw).toLowerCase();
  const hay = `${raw} ${decoded} ${meta.alt || ""} ${meta.cssClass || ""}`.toLowerCase();
  const cssClasses = String(meta.cssClass || "")
    .split(/\s+/)
    .filter(Boolean);

  let score = 0;
  if (cssClasses.includes("image-product")) score += 120;
  if (cssClasses.includes("image-model") || cssClasses.includes("image-look")) score -= 200;
  if (cssClasses.includes("badge-brand")) score -= 500;
  if (PRODUCT_PATH_HINTS.test(decoded) || hay.includes("p-blank") || hay.includes("/p-mt/")) {
    score += 90;
  }
  if (hay.includes("greybg") || hay.includes("whitebg")) score += 45;
  if (String(meta.alt || "").toLowerCase().includes("image produit")) score += 25;
  if (MODEL_PATH_HINTS.test(hay)) score -= 150;
  if (isLmdtModelImagePath(raw)) score -= 250;
  if (raw.includes("/website-components-assets/") || decoded.includes("/m/logo")) score -= 200;
  if (meta.source === "data-image") score -= 120;
  if (meta.source === "img-container-product") score += 30;
  return score;
}

function parseImgTag(tag = "") {
  const src =
    tag.match(/\bsrc="([^"]+)"/i)?.[1] || tag.match(/\bdata-src="([^"]+)"/i)?.[1] || "";
  const cssClass = tag.match(/\bclass="([^"]+)"/i)?.[1] || "";
  const alt = tag.match(/\balt="([^"]+)"/i)?.[1] || "";
  return { src, cssClass, alt };
}

function hasCssClass(cssClass = "", expected = "") {
  return String(cssClass)
    .split(/\s+/)
    .filter(Boolean)
    .includes(expected);
}

export function extractImgContainerHtml(html = "") {
  const start = String(html).search(/<div class="img-container">/i);
  if (start === -1) return "";

  let depth = 0;
  let index = html.indexOf(">", start) + 1;
  const contentStart = index;

  while (index < html.length) {
    if (html.startsWith("<div", index)) {
      depth += 1;
      index += 4;
      continue;
    }
    if (html.startsWith("</div>", index)) {
      if (depth === 0) return html.slice(contentStart, index);
      depth -= 1;
      index += 6;
      continue;
    }
    index += 1;
  }

  return "";
}

export function pickBestProductImageFromCard(cardHtml = "") {
  const html = String(cardHtml);
  const candidates = [];
  const seen = new Set();

  function addCandidate(url, meta = {}) {
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    const score = scoreLmdtImageUrl(url, meta);
    if (score <= -200) return;
    seen.add(url);
    candidates.push({ url, score });
  }

  const containerHtml = extractImgContainerHtml(html);
  if (containerHtml) {
    for (const match of containerHtml.matchAll(/<img\b[^>]*>/gi)) {
      const { src, cssClass, alt } = parseImgTag(match[0]);
      if (!hasCssClass(cssClass, "image-product")) continue;
      addCandidate(src, { cssClass, alt, source: "img-container-product" });
    }
  }

  if (!candidates.length) {
    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      const { src, cssClass, alt } = parseImgTag(match[0]);
      if (!hasCssClass(cssClass, "image-product")) continue;
      addCandidate(src, { cssClass, alt, source: "card-product" });
    }
  }

  if (!candidates.length) {
    for (const match of html.matchAll(/\bdata-image="(https:\/\/media[^"]+)"/gi)) {
      addCandidate(match[1], { cssClass: "", alt: "", source: "data-image" });
    }
  }

  if (!candidates.length) return "";
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score > -100 ? candidates[0].url : "";
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
    const imageUrl = pickBestProductImageFromCard(chunk);
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
      imageUrl,
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
