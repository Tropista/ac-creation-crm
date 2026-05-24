const COLOR_NAME_TO_HEX = {
  // — Français —
  noir: "#1a1a1a",
  "noir profond": "#0d0d0d",
  blanc: "#ffffff",
  marine: "#1e3a5f",
  "bleu marine": "#1e3a5f",
  "french marine": "#092a44",
  royal: "#00569f",
  rouge: "#c41e3a",
  bordeaux: "#722f37",
  vert: "#228b22",
  "vert bouteille": "#17442e",
  "vert prairie": "#00985a",
  kaki: "#8b864e",
  jaune: "#fec440",
  orange: "#f06733",
  corail: "#ff7f50",
  rose: "#ffb6c1",
  fuchsia: "#ff00ff",
  violet: "#7b4397",
  "violet fonce": "#4b2077",
  "violet foncé": "#4b2077",
  lilas: "#c8a2c8",
  gris: "#808080",
  "gris clair": "#d3d3d3",
  "gris anthracite": "#383838",
  "gris chiné": "#999994",
  "gris chine": "#999994",
  "gris souris": "#42454c",
  "gris fonce": "#6b6c6e",
  "gris pur": "#99a6af",
  beige: "#f5f5dc",
  naturel: "#f5f0e1",
  ecru: "#f0ead6",
  crème: "#fffdd0",
  camel: "#c19a6b",
  marron: "#5c4033",
  chocolat: "#3d2314",
  taupe: "#8b8589",
  bleu: "#2563eb",
  "bleu ciel": "#87ceeb",
  "bleu roi": "#4169e1",
  cyan: "#00bcd4",
  turquoise: "#40e0d0",
  aqua: "#1c81a9",
  lavande: "#e6e6fa",
  moutarde: "#ffdb58",
  saumon: "#fa8072",
  citron: "#fff44f",
  pistache: "#93c572",
  sable: "#c2b280",
  terracotta: "#e2725b",
  parme: "#cfc4d6",
  indigo: "#3f51b5",
  menthe: "#98ff98",
  framboise: "#e30b5d",
  peche: "#ffdab9",
  pêche: "#ffdab9",
  army: "#4e5040",
  denim: "#1e3b5a",
  emeraude: "#00806e",
  lime: "#b4cd4e",
  zinc: "#7b7671",
  abricot: "#fe9166",
  ciel: "#86bee4",
  "bleu canard": "#006181",
  "bleu atoll": "#3dc0ce",
  "blanc chine": "#dedfe0",
  "vert pomme": "#b4d070",
  "rose orchidee": "#f174a6",
  "rose moyen": "#f8bfd8",
  "rose pale": "#fbd8e2",
  "rouge tango": "#911a23",
  "violet clair": "#5f408f",

  // — Anglais LMDT (Gildan, B&C, Stanley/Stella, etc.) —
  white: "#ffffff",
  black: "#1a1a1a",
  navy: "#19286b",
  "navy blue": "#051733",
  "royal blue": "#00569f",
  "sport grey": "#9ca3ad",
  "sport gray": "#9ca3ad",
  "heather grey": "#9ca3ad",
  "heather gray": "#9ca3ad",
  grey: "#808080",
  gray: "#808080",
  "dark grey": "#6b6c6e",
  "dark gray": "#6b6c6e",
  "light grey": "#b8b7b0",
  "light gray": "#b8b7b0",
  charcoal: "#383838",
  "charcoal grey": "#42454c",
  "charcoal gray": "#42454c",
  red: "#c41e3a",
  "dark red": "#911a23",
  burgundy: "#620e2f",
  maroon: "#722f37",
  green: "#228b22",
  "kelly green": "#00985a",
  "bottle green": "#17442e",
  "forest green": "#17442e",
  "apple green": "#b4d070",
  olive: "#4e5040",
  yellow: "#fec440",
  gold: "#d4af37",
  pink: "#ffb6c1",
  "hot pink": "#e6007e",
  purple: "#7b4397",
  "dark purple": "#4b2077",
  "light purple": "#5f408f",
  lilac: "#c8a2c8",
  brown: "#5c4033",
  chocolate: "#32221d",
  sand: "#d8b483",
  natural: "#fff4d9",
  cream: "#fffdd0",
  ivory: "#fffff0",
  sky: "#86bee4",
  "sky blue": "#87ceeb",
  "light blue": "#86bee4",
  "process blue": "#00569f",
  cyan: "#00bcd4",
  teal: "#00806e",
  mint: "#98ff98",
  coral: "#ff7f50",
  salmon: "#fa8072",
  peach: "#ffdab9",
  apricot: "#fe9166",
  lemon: "#fff011",
  mustard: "#ffdb58",
  raspberry: "#e30b5d",
  blackberry: "#493991",
  eggplant: "#4b2077",
  wine: "#620e2f",
  stone: "#b8b7b0",
  ash: "#999994",
  slate: "#42454c",
  graphite: "#6b6c6e",
  silver: "#c0c0c0",
  platinum: "#99a6af",
  khaki: "#4e5040",
  tan: "#c19a6b",
  camel: "#c19a6b",
  rust: "#b7410e",
  brick: "#911a23",
  scarlet: "#ce2134",
  crimson: "#c41e3a",
  magenta: "#c60876",
  orchid: "#f174a6",
  lavender: "#e6e6fa",
  violet: "#7b4397",
  indigo: "#3f51b5",
  cobalt: "#00569f",
  sapphire: "#19286b",
  denim: "#1e3b5a",
  midnight: "#092a44",
  "french navy": "#092a44",
  "deep navy": "#182433",
  "black opal": "#1b1f2b",
  "heather navy": "#1e3a5f",
  "heather red": "#c41e3a",
  "heather royal": "#00569f",
  "heather green": "#17442e",
  "heather purple": "#5f408f",
  "heather orange": "#f06733",
  "heather brown": "#5c4033",
  "heather maroon": "#620e2f",
  "heather black": "#1a1a1a",
  "heather blue": "#2563eb",
  "heather pink": "#f8bfd8",
  "heather yellow": "#fec440",
  "heather turquoise": "#40e0d0",
  "heather mint": "#98ff98",
  "heather coral": "#ff7f50",
  "heather khaki": "#8b864e",
  "heather olive": "#4e5040",
  "heather sand": "#d8b483",
  "heather stone": "#b8b7b0",
  "heather charcoal": "#42454c",
  "heather grey marl": "#999994",
  "heather gray marl": "#999994",
  "antique cherry red": "#911a23",
  "antique irish green": "#17442e",
  "antique jade dome": "#00806e",
  "antique orange": "#f06733",
  "antique sapphire": "#19286b",
  "antique heliconia": "#c60876",
  "antique gold": "#d4af37",
  "antique irish": "#17442e",
  "irish green": "#17442e",
  "irish cream": "#fff4d9",
  "safety green": "#00985a",
  "safety orange": "#f06733",
  "safety pink": "#f174a6",
  "safety yellow": "#fec440",
  "electric green": "#00985a",
  "electric blue": "#2563eb",
  "electric pink": "#e6007e",
  "neon green": "#b4cd4e",
  "neon yellow": "#fff011",
  "neon orange": "#f06733",
  "neon pink": "#e6007e",
  "neon blue": "#2563eb",
  "tropical blue": "#3dc0ce",
  "carolina blue": "#86bee4",
  "light steel": "#99a6af",
  "dark chocolate": "#32221d",
  "dark heather": "#42454c",
  "dark heather grey": "#42454c",
  "dark heather gray": "#42454c",
  "light heather grey": "#b8b7b0",
  "light heather gray": "#b8b7b0",
  "true royal": "#00569f",
  "true navy": "#19286b",
  "true red": "#ce2134",
  "true black": "#1a1a18",
  "true white": "#ffffff",
  "classic pink": "#f8bfd8",
  "classic red": "#c41e3a",
  "classic navy": "#19286b",
  "classic royal": "#00569f",
  "classic orange": "#f06733",
  "classic green": "#17442e",
  "classic yellow": "#fec440",
  "classic purple": "#4b2077",
  "classic brown": "#5c4033",
  "classic grey": "#808080",
  "classic gray": "#808080",
  "classic olive": "#4e5040",
  "classic khaki": "#8b864e",
  "classic sand": "#d8b483",
  "classic natural": "#fff4d9",
  "classic cream": "#fffdd0",
  "classic fuchsia": "#c60876",
  "classic turquoise": "#40e0d0",
  "classic sky": "#86bee4",
  "classic lime": "#b4cd4e",
  "classic mint": "#98ff98",
  "classic coral": "#ff7f50",
  "classic salmon": "#fa8072",
  "classic peach": "#ffdab9",
  "classic apricot": "#fe9166",
  "classic lemon": "#fff011",
  "classic mustard": "#ffdb58",
  "classic raspberry": "#e30b5d",
  "classic blackberry": "#493991",
  "classic eggplant": "#4b2077",
  "classic wine": "#620e2f",
  "classic stone": "#b8b7b0",
  "classic ash": "#999994",
  "classic slate": "#42454c",
  "classic graphite": "#6b6c6e",
  "classic silver": "#c0c0c0",
  "classic platinum": "#99a6af",
  "classic tan": "#c19a6b",
  "classic camel": "#c19a6b",
  "classic rust": "#b7410e",
  "classic brick": "#911a23",
  "classic scarlet": "#ce2134",
  "classic crimson": "#c41e3a",
  "classic magenta": "#c60876",
  "classic orchid": "#f174a6",
  "classic lavender": "#e6e6fa",
  "classic violet": "#7b4397",
  "classic indigo": "#3f51b5",
  "classic cobalt": "#00569f",
  "classic sapphire": "#19286b",
  "classic denim": "#1e3b5a",
  "classic midnight": "#092a44",
};

function normalizeColorKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeHex(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-f]{3,8}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

function formatColorLabel(value = "") {
  return String(value)
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveCatalogColorLabel(color) {
  if (!color) return "";
  if (typeof color === "object") {
    return formatColorLabel(color.name || color.label || color.title || "");
  }
  return formatColorLabel(color);
}

export function resolveCatalogColorHex(color) {
  if (!color) return null;

  if (typeof color === "object") {
    const fromField = normalizeHex(color.hex || color.value || color.color);
    if (fromField) return fromField;
    color = resolveCatalogColorLabel(color);
  } else {
    const asHex = normalizeHex(color);
    if (asHex) return asHex;
  }

  const key = normalizeColorKey(color);
  if (COLOR_NAME_TO_HEX[key]) return COLOR_NAME_TO_HEX[key];

  for (const [name, hex] of Object.entries(COLOR_NAME_TO_HEX)) {
    const normalizedName = normalizeColorKey(name);
    if (key === normalizedName) return hex;
  }

  for (const [name, hex] of Object.entries(COLOR_NAME_TO_HEX)) {
    const normalizedName = normalizeColorKey(name);
    if (normalizedName.length >= 4 && (key.includes(normalizedName) || normalizedName.includes(key))) {
      return hex;
    }
  }

  return null;
}

export function resolveCatalogColorImageUrl(color) {
  if (!color || typeof color !== "object") return "";
  return String(color.imageUrl || "").trim();
}

/** Enrichit les couleurs string-only avec un hex depuis la table de correspondance. */
export function enrichCatalogColors(colors = []) {
  return (Array.isArray(colors) ? colors : []).map((color) => {
    if (typeof color === "object" && color !== null) {
      const hex = normalizeHex(color.hex || color.value || color.color) || resolveCatalogColorHex(color);
      const name = resolveCatalogColorLabel(color);
      const imageUrl = resolveCatalogColorImageUrl(color);
      const entry = { name };
      if (hex) entry.hex = hex;
      if (imageUrl) entry.imageUrl = imageUrl;
      if (!hex && !imageUrl && name) return { name };
      return entry;
    }

    const name = resolveCatalogColorLabel(color);
    const hex = resolveCatalogColorHex(color);
    return hex ? { name, hex } : name;
  });
}

export function catalogColorMapSize() {
  return Object.keys(COLOR_NAME_TO_HEX).length;
}
