/** Dossiers catalogue client (libellés FR exacts). */
export const CATALOG_CLIENT_FOLDERS = [
  "T-shirt",
  "Polos",
  "Sweats",
  "Casquettes",
  "Vestes",
  "Workwear",
  "Sport",
  "Bagagerie",
];

export const CATALOG_FOLDER_OTHER = "Autre";

export const CATALOG_FOLDER_ALL = "";

/** Sous-catégories audience (libellés FR). */
export const CATALOG_AUDIENCES = ["Homme", "Femme", "Enfant"];

export const CATALOG_AUDIENCE_UNISEXE = "Unisexe";

export const CATALOG_AUDIENCE_ALL = "";

/** Règles fuzzy : premier match gagne (ordre = priorité métier). */
const FOLDER_MATCH_RULES = [
  {
    folder: "T-shirt",
    patterns: [
      /tee[\s-]?shirts?/i,
      /t[\s-]?shirts?/i,
      /\btee\b/i,
    ],
  },
  {
    folder: "Polos",
    patterns: [/polos?/i],
  },
  {
    folder: "Sweats",
    patterns: [/sweats?/i, /\bpulls?\b/i, /hoodies?/i, /molleton/i],
  },
  {
    folder: "Casquettes",
    patterns: [/casquettes?/i, /\bcaps?\b/i, /bonnets?/i, /echarpes?/i],
  },
  {
    folder: "Vestes",
    patterns: [/vestes?/i, /manteaux?/i, /blousons?/i, /jackets?/i, /gilets?/i],
  },
  {
    folder: "Workwear",
    patterns: [/workwear/i, /travail/i, /securite/i, /safety/i],
  },
  {
    folder: "Sport",
    patterns: [/sport/i, /teamsport/i, /running/i, /fitness/i],
  },
  {
    folder: "Bagagerie",
    patterns: [/bagagerie/i, /\bsacs?\b/i, /\bbags?\b/i, /shopping/i, /sacs-shopping/i],
  },
];

const NAME_GUESS_RULES = [
  { folder: "Casquettes", patterns: [/casquette/i, /\bcap\b/i, /bonnet/i] },
  { folder: "Polos", patterns: [/polo/i] },
  { folder: "Sweats", patterns: [/sweat/i, /hoodie/i, /pull/i] },
  { folder: "Vestes", patterns: [/veste/i, /blouson/i, /manteau/i, /jacket/i] },
  { folder: "Bagagerie", patterns: [/sac\b/i, /bag\b/i, /tote/i, /cabas/i] },
  { folder: "Sport", patterns: [/sport/i, /running/i, /fitness/i] },
  { folder: "T-shirt", patterns: [/tee[\s-]?shirt/i, /t[\s-]?shirt/i] },
  { folder: "Workwear", patterns: [/workwear/i] },
];

/** Enfant avant Homme/Femme ; unisexe explicite prioritaire sur un seul genre. */
const AUDIENCE_MATCH_RULES = [
  {
    audience: "Enfant",
    patterns: [
      /\benfants?\b/,
      /\bkids?\b/,
      /\bjuniors?\b/,
      /\bbabies\b/,
      /\bbaby\b/,
      /\bbebes?\b/,
      /\bnourrissons?\b/,
      /\btoddler/,
      /\bchildren\b/,
      /\bchild\b/,
      /\bgarcons?\b/,
      /\bfillettes?\b/,
      /\bpeques?\b/,
    ],
  },
  {
    audience: CATALOG_AUDIENCE_UNISEXE,
    patterns: [/\bunisex\b/, /\bunisexe\b/, /\bmixte\b/, /\bmixed\b/],
  },
  {
    audience: "Femme",
    patterns: [
      /\bfemmes?\b/,
      /\bwomen\b/,
      /\bwoman\b/,
      /\bladies\b/,
      /\blady\b/,
      /\bdames?\b/,
      /\bfilles\b/,
      /\bfor-?her\b/,
    ],
  },
  {
    audience: "Homme",
    patterns: [
      /\bhommes?\b/,
      /\bmen\b/,
      /\bmens\b/,
      /\bman\b/,
      /\bfor-?him\b/,
      /\bmasculin\b/,
    ],
  },
];

function normalizeFolderKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAnyPattern(text = "", patterns = []) {
  const haystack = normalizeFolderKey(text);
  if (!haystack) return false;
  return patterns.some((pattern) => pattern.test(haystack));
}

function extractCategorySlugFromSourceUrl(sourceUrl = "") {
  const match = String(sourceUrl).match(/\/produits\/([^/]+)\//i);
  return match?.[1] || "";
}

function resolveFolderFromText(text = "") {
  for (const rule of FOLDER_MATCH_RULES) {
    if (matchesAnyPattern(text, rule.patterns)) return rule.folder;
  }
  return null;
}

function guessFolderFromName(name = "") {
  for (const rule of NAME_GUESS_RULES) {
    if (matchesAnyPattern(name, rule.patterns)) return rule.folder;
  }
  return null;
}

/**
 * Mappe un article catalogue vers un dossier client.
 * @param {{ category?: string, categorySlug?: string, name?: string, sourceUrl?: string }} item
 */
export function resolveCatalogFolder(item = {}) {
  const category = item.category || "";
  const categorySlug = item.categorySlug || extractCategorySlugFromSourceUrl(item.sourceUrl);
  const probeTexts = [category, categorySlug, item.sourceUrl || ""].filter(Boolean);

  for (const text of probeTexts) {
    const folder = resolveFolderFromText(text);
    if (folder) return folder;
  }

  const fromName = guessFolderFromName(item.name || "");
  if (fromName) return fromName;

  return CATALOG_FOLDER_OTHER;
}

function detectAudiencesInText(text = "") {
  const haystack = normalizeFolderKey(text);
  if (!haystack) return [];

  const matched = [];
  for (const rule of AUDIENCE_MATCH_RULES) {
    if (matchesAnyPattern(haystack, rule.patterns)) {
      matched.push(rule.audience);
    }
  }
  return matched;
}

function resolveAudienceFromProbeTexts(probeTexts = []) {
  const detected = new Set();
  for (const text of probeTexts) {
    for (const audience of detectAudiencesInText(text)) {
      detected.add(audience);
    }
  }

  if (detected.has("Enfant")) return "Enfant";
  if (detected.has(CATALOG_AUDIENCE_UNISEXE)) return CATALOG_AUDIENCE_UNISEXE;

  const hasHomme = detected.has("Homme");
  const hasFemme = detected.has("Femme");
  if (hasHomme && hasFemme) return CATALOG_AUDIENCE_UNISEXE;
  if (hasHomme) return "Homme";
  if (hasFemme) return "Femme";

  return CATALOG_AUDIENCE_UNISEXE;
}

/**
 * Mappe un article catalogue vers une audience (Homme / Femme / Enfant / Unisexe).
 * @param {{ category?: string, categorySlug?: string, name?: string, sourceUrl?: string }} item
 */
export function resolveCatalogAudience(item = {}) {
  const category = item.category || "";
  const categorySlug = item.categorySlug || extractCategorySlugFromSourceUrl(item.sourceUrl);
  const probeTexts = [item.name || "", category, categorySlug, item.sourceUrl || ""].filter(Boolean);
  return resolveAudienceFromProbeTexts(probeTexts);
}

export function countItemsByAudience(items = []) {
  const counts = Object.fromEntries(CATALOG_AUDIENCES.map((audience) => [audience, 0]));
  counts[CATALOG_AUDIENCE_UNISEXE] = 0;

  for (const item of items) {
    const audience = resolveCatalogAudience(item);
    counts[audience] = (counts[audience] || 0) + 1;
  }

  return counts;
}

export function countItemsByFolder(items = []) {
  const counts = Object.fromEntries(
    CATALOG_CLIENT_FOLDERS.map((folder) => [folder, 0])
  );
  counts[CATALOG_FOLDER_OTHER] = 0;

  for (const item of items) {
    const folder = resolveCatalogFolder(item);
    counts[folder] = (counts[folder] || 0) + 1;
  }

  return counts;
}
