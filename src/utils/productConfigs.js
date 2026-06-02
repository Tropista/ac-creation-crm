// ============================================================
// productConfigs.js
// Configuration multi-produits pour le configurateur 3D.
// Ajouter un produit = ajouter un bloc ici, sans toucher au composant.
// ============================================================

import { TSHIRT_MODEL_URL, POLO_MODEL_URL } from "./assets";

export const PRODUCT_CONFIGS = {

  // ── T-SHIRT ──────────────────────────────────────────────────────────
  tshirt: {
    label: "T-shirt",
    modelUrl: TSHIRT_MODEL_URL,
    printZones: {
      front:       { label: "Avant",          x: 0.075, y: 0.095, w: 0.42,  h: 0.50  },
      back:        { label: "Dos",            x: 0.515, y: 0.095, w: 0.42,  h: 0.50  },
      leftSleeve:  { label: "Manche gauche",  x: 0.112, y: 0.765, w: 0.35,  h: 0.195 },
      rightSleeve: { label: "Manche droite",  x: 0.528, y: 0.765, w: 0.35,  h: 0.195 },
    },
    printZoneSizesCm: {
      front:       { width: 29, height: 40 },
      back:        { width: 29, height: 40 },
      leftSleeve:  { width: 12, height: 12 },
      rightSleeve: { width: 12, height: 12 },
    },
    snapGuides: {
      front: {
        x: [{ value: 0.5, label: "Centre" }],
        y: [
          { value: 0.18, label: "Col" },
          { value: 0.35, label: "Poitrine" },
          { value: 0.5,  label: "Milieu" },
        ],
      },
      back: {
        x: [{ value: 0.5, label: "Centre" }],
        y: [
          { value: 0.25, label: "Haut dos" },
          { value: 0.5,  label: "Milieu" },
        ],
      },
      leftSleeve: {
        x: [{ value: 0.5, label: "Centre manche" }],
        y: [{ value: 0.5, label: "Milieu manche" }],
      },
      rightSleeve: {
        x: [{ value: 0.5, label: "Centre manche" }],
        y: [{ value: 0.5, label: "Milieu manche" }],
      },
    },
    sizePresets: {
      XS:    { label: "XS",  chest: 46, length: 64, scale: [0.88, 0.94, 0.88], note: "Aperçu plus petit." },
      S:     { label: "S",   chest: 49, length: 67, scale: [0.94, 0.98, 0.94], note: "Petite taille adulte." },
      M:     { label: "M",   chest: 52, length: 70, scale: [1,    1,    1   ], note: "Taille de référence." },
      L:     { label: "L",   chest: 55, length: 73, scale: [1.06, 1.03, 1.06], note: "Aperçu légèrement plus large." },
      XL:    { label: "XL",  chest: 58, length: 76, scale: [1.12, 1.06, 1.12], note: "Grande taille adulte." },
      "2XL": { label: "2XL", chest: 61, length: 79, scale: [1.18, 1.09, 1.18], note: "Visuel proportionnellement plus petit." },
      "3XL": { label: "3XL", chest: 64, length: 82, scale: [1.24, 1.12, 1.24], note: "Très grande taille." },
      "4XL": { label: "4XL", chest: 67, length: 85, scale: [1.30, 1.15, 1.30], note: "Aperçu très large." },
      "5XL": { label: "5XL", chest: 70, length: 88, scale: [1.36, 1.18, 1.36], note: "Taille maximale d'aperçu." },
    },
    printSizePresets: [
      { label: "DTF poitrine 28 × 35 cm",   width: 28,   height: 35   },
      { label: "A4 portrait 21 × 29,7 cm",  width: 21,   height: 29.7 },
      { label: "A3 portrait 29 × 42 cm",    width: 29,   height: 42   },
      { label: "Manche 12 × 12 cm",         width: 12,   height: 12   },
    ],
  },

  // ── POLO ─────────────────────────────────────────────────────────────
  // Coordonnées UV calibrées depuis la texture Material_36_baseColor.png
  // Layout atlas :
  //  ┌──────────────┬──────────────┐
  //  │   AVANT      │   DOS        │
  //  │  (0→0.48)    │  (0.52→1)   │
  //  ├──────────────┤              │
  //  │  col/boutons │              │
  //  ├──────────────┴──────────────┤
  //  │     bande col basse         │
  //  ├──────────────┬──────────────┤
  //  │ MANCHE G     │ MANCHE D     │
  //  └──────────────┴──────────────┘
  polo: {
    label: "Polo",
    modelUrl: POLO_MODEL_URL,
    baseTextureUrl: "models/polo/textures/Material_36_baseColor.png",
    uvFlipY: true,   // V=0 en bas sur ce modèle → annuler le (1-y) du drawItem
    // UV calculés depuis la texture atlas Material_36_baseColor.png
    printZones: {
      front:       { label: "Avant",          x: 0.060, y: 0.180, w: 0.460, h: 0.603 },
      back:        { label: "Dos",            x: 0.500, y: 0.022, w: 0.482, h: 0.603 },
      leftSleeve:  { label: "Manche gauche",  x: 0.019, y: 0.745, w: 0.418, h: 0.192 },
      rightSleeve: { label: "Manche droite",  x: 0.500, y: 0.781, w: 0.446, h: 0.201 },
    },
    printZoneSizesCm: {
      front:       { width: 27, height: 36 },
      back:        { width: 27, height: 36 },
      leftSleeve:  { width: 10, height: 10 },
      rightSleeve: { width: 10, height: 10 },
    },
    snapGuides: {
      front: {
        x: [{ value: 0.5, label: "Centre" }],
        y: [
          { value: 0.30, label: "Poitrine" },
          { value: 0.55, label: "Milieu" },
        ],
      },
      back: {
        x: [{ value: 0.5, label: "Centre" }],
        y: [{ value: 0.5, label: "Milieu" }],
      },
      leftSleeve: {
        x: [{ value: 0.5, label: "Centre manche" }],
        y: [{ value: 0.5, label: "Milieu manche" }],
      },
      rightSleeve: {
        x: [{ value: 0.5, label: "Centre manche" }],
        y: [{ value: 0.5, label: "Milieu manche" }],
      },
    },
    sizePresets: {
      XS:    { label: "XS",  chest: 44, length: 66, scale: [0.88, 0.94, 0.88] },
      S:     { label: "S",   chest: 47, length: 69, scale: [0.94, 0.98, 0.94] },
      M:     { label: "M",   chest: 50, length: 72, scale: [1,    1,    1   ] },
      L:     { label: "L",   chest: 53, length: 75, scale: [1.06, 1.03, 1.06] },
      XL:    { label: "XL",  chest: 56, length: 78, scale: [1.12, 1.06, 1.12] },
      "2XL": { label: "2XL", chest: 59, length: 81, scale: [1.18, 1.09, 1.18] },
      "3XL": { label: "3XL", chest: 62, length: 84, scale: [1.24, 1.12, 1.24] },
    },
    printSizePresets: [
      { label: "DTF poitrine 27 × 35 cm",  width: 27,   height: 35   },
      { label: "A4 portrait 21 × 29,7 cm", width: 21,   height: 29.7 },
      { label: "Manche 10 × 10 cm",        width: 10,   height: 10   },
    ],
  },
};

export const PRODUCT_OPTIONS = Object.entries(PRODUCT_CONFIGS).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

export function getProductConfig(productKey) {
  return PRODUCT_CONFIGS[productKey] || PRODUCT_CONFIGS.tshirt;
}
