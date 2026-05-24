const ALLOWED_HOSTS = new Set(["www.lamaisonduteeshirt.com", "lamaisonduteeshirt.com"]);

/** Bump when packshot selection logic changes — used by /api/catalog/health. */
export const LMDT_PARSER_VERSION = 5;

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
/** Color swatch / model worn shots: /c/15381/15381-17237-1.jpg or /c/p/175/175-199-1.jpg */
const MODEL_COLOR_VARIANT_PATH =
  /\/c\/(?:p\/)?\d+\/\d+-\d+-\d+\.(jpe?g|webp)/i;
/** Worn/model sequence suffix e.g. 3128-3104-1.jpg or 175-199-1.jpg */
const MODEL_SEQUENCE_SUFFIX = /\/\d+-\d+-\d+\.(jpe?g|webp)(?:\?|$)/i;

export function isAllowedLmdtUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isLmdtPackshotImagePath(url = "") {
  const decoded = decodeLmdtMediaPath(url).toLowerCase();
  if (!decoded) return false;
  if (PRODUCT_PATH_HINTS.test(decoded)) return true;
  if (decoded.includes("p-blank") || decoded.includes("/p-mt/")) return true;
  if (String(url).includes("greybg") || String(url).includes("whitebg")) return true;
  return false;
}

export function isLmdtModelImagePath(url = "") {
  const decoded = decodeLmdtMediaPath(url).toLowerCase();
  if (!decoded) return false;
  if (isLmdtPackshotImagePath(url)) return false;
  if (MODEL_COLOR_VARIANT_PATH.test(decoded)) return true;
  if (MODEL_SEQUENCE_SUFFIX.test(decoded)) return true;
  if (MODEL_PATH_HINTS.test(decoded)) return true;
  if (/\/c\/p\/\d+\/\d+-\d+-/i.test(decoded)) return true;
  return false;
}

export function classifyLmdtImageUrl(url = "") {
  if (!String(url).trim()) return "none";
  if (isValidLmdtPackshotUrl(url)) return "packshot";
  if (isLmdtModelImagePath(url)) return "model";
  return "unknown";
}

/** Packshot usable in catalog: greybg crop + p-blank path, never worn/model shots. */
export function isValidLmdtPackshotUrl(url = "") {
  const raw = String(url).trim();
  if (!raw || isLmdtModelImagePath(raw)) return false;
  if (!raw.includes("greybg")) return false;
  return isLmdtPackshotImagePath(raw);
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

function isAcceptableLmdtImage(url = "", meta = {}) {
  const score = scoreLmdtImageUrl(url, meta);
  return score > -100;
}

function collectOrderedImageProductFromContainer(containerHtml = "") {
  const images = [];
  for (const match of String(containerHtml).matchAll(/<img\b[^>]*>/gi)) {
    const { src, cssClass, alt } = parseImgTag(match[0]);
    if (!hasCssClass(cssClass, "image-product")) continue;
    if (!src || !/^https?:\/\//i.test(src)) continue;
    images.push({ url: src, meta: { cssClass, alt, source: "img-container-product" } });
  }
  return images;
}

function pickFromOrderedImageProducts(ordered = []) {
  if (!ordered.length) return "";

  let best = null;
  for (const candidate of ordered) {
    if (!isAcceptableLmdtImage(candidate.url, candidate.meta)) continue;
    if (isLmdtModelImagePath(candidate.url)) continue;
    const score = scoreLmdtImageUrl(candidate.url, candidate.meta);
    if (!best || score > best.score) {
      best = { url: candidate.url, score };
    }
  }
  return best?.url || "";
}

/** Product detail gallery: index 0 is the packshot slide; 1+ are model/color shots. */
export const PICK_GALLERY_IMAGE_INDEX = 0;

export function collectProductGalleryImageUrls(html = "") {
  const htmlStr = String(html);
  const swiperMatch = htmlStr.match(/id="swiper-product-images"[\s\S]*?(?=<div class="swiper-button-prev"|<\/div>\s*<div>\s*<div class="grande_photo")/i);
  const swiperHtml = swiperMatch ? swiperMatch[0] : htmlStr;
  const urls = [];
  const seen = new Set();

  for (const anchorMatch of swiperHtml.matchAll(/<a\b[^>]*>/gi)) {
    const anchor = anchorMatch[0];
    const dataSrc = anchor.match(/\bdata-src="(https:\/\/media[^"]+)"/i)?.[1];
    const dataLink = anchor.match(/\bdata-link="(https:\/\/media[^"]+)"/i)?.[1];
    for (const url of [dataSrc, dataLink]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

export function parseProductDetailHeroImageUrl(html = "") {
  const htmlStr = String(html);
  const photoTag =
    htmlStr.match(/<img\b[^>]*\bid="photo_produit"[^>]*>/i)?.[0] ||
    htmlStr.match(/<img\b[^>]*\bid='photo_produit'[^>]*>/i)?.[0] ||
    "";
  if (photoTag) {
    const src =
      photoTag.match(/\bsrc="(https:\/\/media[^"]+)"/i)?.[1] ||
      photoTag.match(/\bsrc='(https:\/\/media[^']+)'/i)?.[1] ||
      "";
    if (src) return src;
    const fallbackSrc = photoTag.match(/\bdefault="(https:\/\/media[^"]+)"/i)?.[1];
    if (fallbackSrc) return fallbackSrc;
  }

  return "";
}

/** Packshot preview from galleryLien-main data-src (580greybg), not worn color slides. */
export function parseGalleryMainPackshotUrl(html = "") {
  const htmlStr = String(html);
  const mainSlideMatch = htmlStr.match(
    /class="swiper-slide galleryLien-main galleryLien-image"[\s\S]*?<a\b[^>]*\bdata-src="(https:\/\/media[^"]+)"/i
  );
  return mainSlideMatch?.[1] || "";
}

export function pickProductDetailImageUrl(html = "", preferredIndex = PICK_GALLERY_IMAGE_INDEX) {
  void preferredIndex;

  const heroImage = parseProductDetailHeroImageUrl(html);
  if (isValidLmdtPackshotUrl(heroImage)) {
    return heroImage;
  }

  const mainGalleryPackshot = parseGalleryMainPackshotUrl(html);
  if (isValidLmdtPackshotUrl(mainGalleryPackshot)) {
    return mainGalleryPackshot;
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
    const orderedProductImages = collectOrderedImageProductFromContainer(containerHtml);
    const pickedFromOrder = pickFromOrderedImageProducts(orderedProductImages);
    if (pickedFromOrder) return pickedFromOrder;

    for (const { url, meta } of orderedProductImages) {
      addCandidate(url, meta);
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

function normalizeLmdtColorName(raw = "") {
  return decodeHtmlText(raw).replace(/_/g, " ").trim();
}

function normalizeLmdtColorHex(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.toLowerCase();
  if (/^[0-9a-f]{3,8}$/i.test(value)) return `#${value.toLowerCase()}`;
  const rgbMatch = value.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    const toHex = (n) => Number(n).toString(16).padStart(2, "0");
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  return value;
}

function extractBackgroundColorFromTag(tag = "") {
  const styleMatch = String(tag).match(/style="([^"]*)"/i);
  if (!styleMatch) return "";
  const bgMatch = styleMatch[1].match(/background-color:\s*([^;"']+)/i);
  return bgMatch?.[1]?.trim() || "";
}

function pushParsedColor(colors, seen, { name, hex = "", imageUrl = "" }) {
  if (!name) return;
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);

  if (hex || imageUrl) {
    const entry = { name };
    if (hex) entry.hex = hex;
    if (imageUrl) entry.imageUrl = imageUrl;
    colors.push(entry);
    return;
  }

  colors.push(name);
}

function parseListingColorItemSwatches(html = "") {
  const colors = [];
  const seen = new Set();

  for (const match of String(html).matchAll(/<a\b[^>]*class="color-item"[^>]*>/gi)) {
    const tag = match[0];
    const titleMatch = tag.match(/\btitle="([^"]+)"/i);
    if (!titleMatch) continue;

    const name = normalizeLmdtColorName(titleMatch[1]);
    const hex = normalizeLmdtColorHex(extractBackgroundColorFromTag(tag));
    const imageUrl = tag.match(/\bdata-image="([^"]+)"/i)?.[1]?.trim() || "";
    pushParsedColor(colors, seen, { name, hex, imageUrl });
  }

  return colors;
}

function parseDetailPageColorItemsFromHtml(html = "") {
  const colors = [];
  const seen = new Set();
  const htmlStr = String(html);
  const choixMatch = htmlStr.match(/id="choixCouleurs"[\s\S]*?(?=<div class="[^"]*tableau|<div id="tableau)/i);
  const section = choixMatch ? choixMatch[0] : htmlStr;

  for (const match of section.matchAll(
    /<a\b[^>]*\bid="lien_\d+"[^>]*\bdata-colorId="\d+"[^>]*\brel="(https:\/\/media[^"]+)"[^>]*>[\s\S]*?<div\b[^>]*\btitle="([^"]+)"/gi
  )) {
    const imageUrl = match[1]?.trim() || "";
    const name = normalizeLmdtColorName(match[2]);
    pushParsedColor(colors, seen, { name, imageUrl });
  }

  return colors;
}

export function parseColorItemsFromHtml(html) {
  const listingColors = parseListingColorItemSwatches(html);
  if (listingColors.length) return listingColors;
  return parseDetailPageColorItemsFromHtml(html);
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
    // Listing thumbnails can be model shots — only detail-page enrichment sets imageUrl.
    const imageUrl = "";
    const grammageMatch = chunk.match(/<span class="grammage">([^<]+)</i);
    const minQtyMatch = chunk.match(/class="price-explain"[\s\S]*?<span>x(\d+)<\/span>/i);
    const colorsMatch = chunk.match(/class="colors-btn"[\s\S]*?>\s*(\d+)/i);

    const brand = decodeHtmlText(brandMatch?.[1] || "");
    const productName = decodeHtmlText(nameMatch?.[1] || "");
    const { priceHT, priceTTC } = parsePriceParts(chunk);

    const colors = parseColorItemsFromHtml(chunk);

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
