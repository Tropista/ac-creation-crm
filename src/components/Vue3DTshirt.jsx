import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import jsPDF from "jspdf";
import "./Vue3DTshirt.css";
import Product3DErrorBoundary from "./3d/Product3DErrorBoundary";
import { showToast } from "../utils/toast";
import { TSHIRT_MODEL_URL } from "../utils/assets";
import {
  buildCalculatorQuoteLine,
  buildTshirtConfiguratorQuoteDescription,
  buildTshirtConfiguratorWorkshopNotes,
  getCrmQuotesUrl,
  openQuoteFromCalculator,
  saveQuoteDraft,
} from "../utils/quoteDraft";
import {
  attachConfiguratorExportsToDraft,
  CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
  formatConfiguratorAttachmentErrors,
  withTimeout,
} from "../utils/tshirtQuoteAttachments";
import { submitPublicLead } from "../services/leadsService";
import { estimatePrintPriceHT } from "../utils/tshirtPricing";
import { PUBLIC_TSHIRT_PATH } from "../utils/routes";

const MODEL_URL = TSHIRT_MODEL_URL;
const TEXTURE_SIZE = 2048;

const PRINT_ZONES = {
  front: { label: "Avant", x: 0.075, y: 0.095, w: 0.42, h: 0.50 },
  back: { label: "Dos", x: 0.515, y: 0.095, w: 0.42, h: 0.50 },
  leftSleeve: { label: "Manche gauche", x: 0.112, y: 0.765, w: 0.35, h: 0.195 },
  rightSleeve: { label: "Manche droite", x: 0.528, y: 0.765, w: 0.35, h: 0.195 },
};

// Dimensions réelles des zones imprimables utilisées pour l'export impression.
// Modifie ces valeurs si tu veux adapter ton flux DTF / sublimation / sérigraphie.
const PRINT_ZONE_SIZES_CM = {
  front: { width: 29, height: 40 },
  back: { width: 29, height: 40 },
  leftSleeve: { width: 12, height: 12 },
  rightSleeve: { width: 12, height: 12 },
};

// Limites de travail dans l'éditeur : le visuel reste dans la zone pointillée.
const MAX_PRINT_WIDTH_CM = 29;
const EDITOR_PRINT_INSET = 0.07;
const EDITOR_PRINT_SIZE = 1 - EDITOR_PRINT_INSET * 2;
const SNAP_THRESHOLD = 0.025;

const PRINT_SIZE_PRESETS = [
  { label: "DTF poitrine 28 × 35 cm", width: 28, height: 35 },
  { label: "A4 portrait 21 × 29,7 cm", width: 21, height: 29.7 },
  { label: "A3 portrait 29 × 42 cm", width: 29, height: 42 },
  { label: "Manche 12 × 12 cm", width: 12, height: 12 },
];

const GARMENT_SIZE_PRESETS = {
  XS: { label: "XS", chest: 46, length: 64, scale: [0.88, 0.94, 0.88], note: "Aperçu plus petit : logo visuellement plus présent." },
  S: { label: "S", chest: 49, length: 67, scale: [0.94, 0.98, 0.94], note: "Petite taille adulte." },
  M: { label: "M", chest: 52, length: 70, scale: [1, 1, 1], note: "Taille de référence." },
  L: { label: "L", chest: 55, length: 73, scale: [1.06, 1.03, 1.06], note: "Aperçu légèrement plus large." },
  XL: { label: "XL", chest: 58, length: 76, scale: [1.12, 1.06, 1.12], note: "Grande taille adulte." },
  "2XL": { label: "2XL", chest: 61, length: 79, scale: [1.18, 1.09, 1.18], note: "Visuel proportionnellement plus petit." },
  "3XL": { label: "3XL", chest: 64, length: 82, scale: [1.24, 1.12, 1.24], note: "Très grande taille." },
  "4XL": { label: "4XL", chest: 67, length: 85, scale: [1.30, 1.15, 1.30], note: "Aperçu très large." },
  "5XL": { label: "5XL", chest: 70, length: 88, scale: [1.36, 1.18, 1.36], note: "Taille maximale d’aperçu." },
};

const GARMENT_SIZE_OPTIONS = Object.keys(GARMENT_SIZE_PRESETS);

const TECHNIQUE_PRESETS = {
  dtf: {
    label: "DTF",
    shortLabel: "DTF",
    help: "Impression couleur avec fond transparent. Idéal pour logos, photos et textes multicolores.",
    minWidth: 2,
    minHeight: 2,
    bleedCm: 0.2,
    note: "Prévoir un fichier PNG propre, idéalement 300 DPI.",
  },
  flex: {
    label: "Flex / vinyle",
    shortLabel: "Flex",
    help: "Découpe vinyle. Idéal pour textes simples et formes pleines.",
    minWidth: 1.5,
    minHeight: 1.5,
    bleedCm: 0,
    note: "Éviter les détails trop fins et les dégradés.",
  },
  uv: {
    label: "UV-DTF",
    shortLabel: "UV",
    help: "Transfert UV pour objets ou marquages vernis. Alternative au DTF textile classique.",
    minWidth: 2,
    minHeight: 2,
    bleedCm: 0.1,
    note: "Vérifier la compatibilité textile / objet avant production.",
  },
};

const TECHNIQUE_OPTIONS = Object.entries(TECHNIQUE_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label,
}));

const EXPORT_DPI = 300;
const CM_TO_INCH = 1 / 2.54;

const DEFAULT_TEXT_ITEM = {
  type: "text",
  area: "front",
  x: 0.5,
  y: 0.38,
  width: 0.28,
  height: 0.12,
  rotation: 0,
  text: "AC CREATION",
  textColor: "#111827",
  textSize: 74,
  fontFamily: "Arial",
  strokeEnabled: false,
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowBlur: 8,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
  curve: 0,
};

const PROJECTS_STORAGE_KEY = "ac-creation-tshirt-projects-v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultLayerName(item) {
  if (item?.layerName) return item.layerName;
  if (item?.type === "text") return item.text || "Texte";
  return item?.fileName || "Logo";
}

function makeLayerName(value, fallback = "Calque") {
  const name = String(value || "").trim();
  return name || fallback;
}

function cmToPixels(cm) {
  return Math.max(1, Math.round(Number(cm || 0) * CM_TO_INCH * EXPORT_DPI));
}

function formatCm(value) {
  return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function getZoneSizeCm(zoneSizes, area) {
  return zoneSizes?.[area] || PRINT_ZONE_SIZES_CM[area] || PRINT_ZONE_SIZES_CM.front;
}

function getMaxItemWidthScale(area, zoneSizes) {
  const zoneSize = getZoneSizeCm(zoneSizes, area);
  return Math.min(1, MAX_PRINT_WIDTH_CM / Math.max(1, Number(zoneSize.width || 1)));
}

function limitItemToPrintArea(item, zoneSizes) {
  const maxWidth = getMaxItemWidthScale(item.area || "front", zoneSizes);
  const width = clamp(Number(item.width || 0.22), 0.035, maxWidth);
  const height = clamp(Number(item.height || 0.16), 0.025, 1);

  return {
    ...item,
    width,
    height,
    x: clamp(Number(item.x ?? 0.5), width / 2, 1 - width / 2),
    y: clamp(Number(item.y ?? 0.5), height / 2, 1 - height / 2),
  };
}


function estimateTextWidthScale(item, zoneSizes) {
  const text = String(item?.text || "Texte");
  const fontSize = Math.max(24, Number(item?.textSize || 74));
  const fontFamily = item?.fontFamily || "Arial";
  const height = Math.max(0.025, Number(item?.height || 0.12));
  const maxWidth = getMaxItemWidthScale(item?.area || "front", zoneSizes);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return clamp(text.length * height * 0.34, 0.08, maxWidth);

  ctx.font = `800 ${fontSize}px "${fontFamily}"`;
  const measuredWidth = Math.max(1, ctx.measureText(text).width);
  const measuredRatio = measuredWidth / fontSize;

  // Le coefficient garde le cadre proche du texte affiché dans l’éditeur,
  // sans prendre toute la largeur de la zone.
  return clamp(height * measuredRatio * 0.58, 0.08, maxWidth);
}

function withAutoTextWidth(item, zoneSizes) {
  if (item?.type !== "text") return item;
  return {
    ...item,
    width: estimateTextWidthScale(item, zoneSizes),
  };
}

function getRulerTicks(totalCm, maxTicks = 12) {
  const total = Math.max(1, Number(totalCm || 1));
  const approxStep = total / maxTicks;
  const step = approxStep <= 1 ? 1 : approxStep <= 2 ? 2 : approxStep <= 5 ? 5 : 10;
  const ticks = [];
  for (let value = 0; value <= total + 0.001; value += step) {
    ticks.push({ value: Number(value.toFixed(1)), percent: Math.min(100, (value / total) * 100) });
  }
  if (!ticks.some((tick) => Math.abs(tick.value - total) < 0.001)) {
    ticks.push({ value: total, percent: 100 });
  }
  return ticks;
}

function getSnapGuides(area) {
  const sleeve = area === "leftSleeve" || area === "rightSleeve";

  if (sleeve) {
    return {
      x: [
        { value: 0.5, label: "Centre manche" },
      ],
      y: [
        { value: 0.5, label: "Milieu manche" },
      ],
    };
  }

  return {
    x: [
      { value: 0.5, label: "Centre" },
    ],
    y: [
      { value: 0.18, label: "Col" },
      { value: 0.35, label: "Poitrine" },
      { value: 0.5, label: "Milieu" },
    ],
  };
}

function snapValue(value, guides, threshold = SNAP_THRESHOLD) {
  let snapped = value;
  let activeGuide = null;

  for (const guide of guides || []) {
    if (Math.abs(value - guide.value) <= threshold) {
      snapped = guide.value;
      activeGuide = guide;
      break;
    }
  }

  return { value: snapped, guide: activeGuide };
}

function applySnapToPosition(item, patch, enabled = true) {
  if (!enabled) return { patch, preview: null };

  const guides = getSnapGuides(item.area || "front");
  const snappedX = snapValue(Number(patch.x ?? item.x ?? 0.5), guides.x);
  const snappedY = snapValue(Number(patch.y ?? item.y ?? 0.5), guides.y);

  return {
    patch: {
      ...patch,
      x: snappedX.value,
      y: snappedY.value,
    },
    preview: {
      x: snappedX.guide,
      y: snappedY.guide,
    },
  };
}

function sanitizeFilename(value) {
  return String(value || "element")
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "element";
}


function sanitizeFontFilename(value, fallbackExtension = ".ttf") {
  const raw = String(value || "police").trim();
  const hasExtension = /\.(ttf|otf|woff|woff2)$/i.test(raw);
  const extension = hasExtension
    ? raw.match(/\.(ttf|otf|woff|woff2)$/i)?.[0]?.toLowerCase() || fallbackExtension
    : fallbackExtension;
  const base = raw
    .replace(/\.(ttf|otf|woff|woff2)$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "police";
  return `${base}${extension}`;
}

function getFontExtension(file) {
  const name = String(file?.name || "");
  const extFromName = name.match(/\.(ttf|otf|woff|woff2)$/i)?.[0];
  if (extFromName) return extFromName.toLowerCase();

  const type = String(file?.type || "").toLowerCase();
  if (type.includes("opentype") || type.includes("otf")) return ".otf";
  if (type.includes("woff2")) return ".woff2";
  if (type.includes("woff")) return ".woff";

  // Windows peut fournir une police sans extension via C:\Windows\Fonts.
  // Dans ce cas on ajoute .ttf pour que le fichier soit ouvrable/installable.
  return ".ttf";
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Export PNG impossible."));
    }, "image/png");
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dateToDosTime(date = new Date()) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

async function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = dateToDosTime();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(dataBytes);

    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, now.time, true);
    localView.setUint16(12, now.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    new Uint8Array(localHeader, 30).set(nameBytes);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, now.time, true);
    centralView.setUint16(14, now.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    new Uint8Array(centralHeader, 46).set(nameBytes);
    centralParts.push(centralHeader);

    offset += localHeader.byteLength + dataBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endHeader = new ArrayBuffer(22);
  const endView = new DataView(endHeader);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader], { type: "application/zip" });
}

function getItemPrintSizeCm(item, zoneSizes = PRINT_ZONE_SIZES_CM) {
  const areaSize = getZoneSizeCm(zoneSizes, item.area);
  return {
    width: Math.max(0.1, Number(item.width || 0.22) * areaSize.width),
    height: Math.max(0.1, Number(item.height || 0.16) * areaSize.height),
  };
}

function getTechniquePreset(itemOrValue) {
  const key = typeof itemOrValue === "string" ? itemOrValue : itemOrValue?.technique;
  return TECHNIQUE_PRESETS[key] || TECHNIQUE_PRESETS.dtf;
}

function getTechniqueWarnings(item, zoneSizes = PRINT_ZONE_SIZES_CM) {
  if (!item) return [];
  const preset = getTechniquePreset(item);
  const size = getItemPrintSizeCm(item, zoneSizes);
  const warnings = [];

  if (size.width < preset.minWidth || size.height < preset.minHeight) {
    warnings.push(`Taille trop petite pour ${preset.label} : minimum conseillé ${formatCm(preset.minWidth)} × ${formatCm(preset.minHeight)} cm.`);
  }

  if (preset.maxWidth && size.width > preset.maxWidth) {
    warnings.push(`Largeur trop grande pour ${preset.label} : maximum conseillé ${formatCm(preset.maxWidth)} cm.`);
  }

  if (preset.maxHeight && size.height > preset.maxHeight) {
    warnings.push(`Hauteur trop grande pour ${preset.label} : maximum conseillé ${formatCm(preset.maxHeight)} cm.`);
  }


  return warnings;
}

function getTechniqueSummaryForArea(items, area) {
  const techniques = Array.from(new Set((items || [])
    .filter((item) => item.area === area && !item.hidden)
    .map((item) => getTechniquePreset(item).shortLabel)));
  return techniques.length ? techniques.join(" / ") : "Aucune";
}


function drawTextWithEffects(ctx, item, text, maxWidth, maxHeight) {
  const safeText = String(text || "Texte");
  const curve = Number(item.curve || 0);
  const fillColor = item.textColor || "#111827";
  const strokeEnabled = Boolean(item.strokeEnabled);
  const strokeColor = item.strokeColor || "#000000";
  const strokeWidth = Math.max(0, Number(item.strokeWidth || 0));

  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (item.shadowEnabled) {
    ctx.shadowColor = item.shadowColor || "#000000";
    ctx.shadowBlur = Math.max(0, Number(item.shadowBlur || 0));
    ctx.shadowOffsetX = Number(item.shadowOffsetX || 0);
    ctx.shadowOffsetY = Number(item.shadowOffsetY || 0);
  }

  let fontSize = Math.floor(maxHeight * 0.72);
  ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;

  while (ctx.measureText(safeText).width > maxWidth * 0.92 && fontSize > 8) {
    fontSize -= 2;
    ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
  }

  if (Math.abs(curve) > 2 && safeText.length > 1) {
    const chars = [...safeText];
    const totalWidth = Math.max(1, chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0));
    const arcPower = Math.min(1, Math.abs(curve) / 100);
    const arcAngle = Math.max(0.35, arcPower * Math.PI * 0.95);
    const radius = Math.max(maxHeight * 0.9, totalWidth / arcAngle);
    const direction = curve > 0 ? -1 : 1;
    let cursor = -totalWidth / 2;

    chars.forEach((char) => {
      const charWidth = ctx.measureText(char).width;
      const center = cursor + charWidth / 2;
      const angle = center / radius;
      const x = Math.sin(angle) * radius;
      const y = direction * (Math.cos(angle) * radius - radius);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(direction * angle);
      if (strokeEnabled && strokeWidth > 0) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = strokeColor;
        ctx.lineJoin = "round";
        ctx.strokeText(char, 0, 0);
      }
      ctx.fillText(char, 0, 0);
      ctx.restore();
      cursor += charWidth;
    });
  } else {
    if (strokeEnabled && strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.lineJoin = "round";
      ctx.strokeText(safeText, 0, 0, maxWidth * 0.92);
    }
    ctx.fillText(safeText, 0, 0, maxWidth * 0.92);
  }

  ctx.restore();
}

function drawPrintItemForExport(ctx, item, logoImage, widthPx, heightPx) {
  ctx.clearRect(0, 0, widthPx, heightPx);
  ctx.save();
  ctx.translate(widthPx / 2, heightPx / 2);

  if (item.rotation) {
    ctx.rotate((Number(item.rotation || 0) * Math.PI) / 180);
  }

  if (item.type === "image" && logoImage) {
    ctx.drawImage(logoImage, -widthPx / 2, -heightPx / 2, widthPx, heightPx);
  }

  if (item.type === "text") {
    drawTextWithEffects(ctx, item, item.text || "Texte", widthPx, heightPx);
  }

  ctx.restore();
}

function useItemImages(items) {
  const [images, setImages] = useState({});
  useEffect(() => {
    let alive = true;
    const logoItems = items.filter((item) => item.type === "image" && item.src);
    if (!logoItems.length) {
      setImages({});
      return;
    }

    const loaded = {};
    let count = 0;
    for (const item of logoItems) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loaded[item.id] = img;
        count += 1;
        if (alive && count === logoItems.length) setImages(loaded);
      };
      img.onerror = () => {
        count += 1;
        if (alive && count === logoItems.length) setImages(loaded);
      };
      img.src = item.src;
    }
    return () => {
      alive = false;
    };
  }, [items]);
  return images;
}

function drawItem(ctx, item, zone, logoImage) {
  const zoneX = zone.x * TEXTURE_SIZE;
  const zoneY = zone.y * TEXTURE_SIZE;
  const zoneW = zone.w * TEXTURE_SIZE;
  const zoneH = zone.h * TEXTURE_SIZE;

  // Correction UV du modèle fourni :
  // - L’axe X doit rester normal : droite dans l’éditeur = droite sur le t-shirt.
  // - L’axe Y du modèle est inversé : haut dans l’éditeur = on dessine plus bas dans l’UV.
  // - On pré-inverse verticalement le contenu pour que logo et texte apparaissent droits.
  const itemX = clamp(Number(item.x ?? 0.5), 0, 1);
  const itemY = clamp(Number(item.y ?? 0.5), 0, 1);
  const cx = zoneX + itemX * zoneW;
  const cy = zoneY + (1 - itemY) * zoneH;

  const drawW = Math.max(30, Number(item.width || 0.25) * zoneW);
  const drawH = Math.max(20, Number(item.height || 0.18) * zoneH);
  const rotation = (Number(item.rotation || 0) * Math.PI) / 180;

  ctx.save();
  ctx.beginPath();
  ctx.rect(zoneX, zoneY, zoneW, zoneH);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(1, -1);

  if (item.type === "image" && logoImage) {
    ctx.drawImage(logoImage, -drawW / 2, -drawH / 2, drawW, drawH);
  }

  if (item.type === "text") {
    drawTextWithEffects(ctx, item, item.text || "Texte", drawW, drawH);
  }

  ctx.restore();
}

function makeUvTexture(itemImages, items, tshirtColor) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = tshirtColor || "#ffffff";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const drawableItems = items
    .filter((item) => !item.hidden)
    .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

  for (const item of drawableItems) {
    const zone = PRINT_ZONES[item.area] || PRINT_ZONES.front;
    drawItem(ctx, item, zone, itemImages[item.id]);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  // Important : ne pas inverser la texture Three.js globalement.
  // Sinon les zones avant/dos sont échangées et des traits noirs peuvent apparaître.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  texture.needsUpdate = true;
  return texture;
}

function TshirtModel({ texture, garmentScale = [1, 1, 1] }) {
  const { scene } = useGLTF(MODEL_URL);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      child.material = new THREE.MeshStandardMaterial({
        map: texture,
        color: "#ffffff",
        roughness: 0.72,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      child.material.needsUpdate = true;
    });

    return clone;
  }, [scene, texture]);

  return <primitive object={clonedScene} scale={garmentScale} />;
}

export default function Vue3DTshirt() {
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicConfigurator = location.pathname.includes(PUBLIC_TSHIRT_PATH);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeArea, setActiveArea] = useState("front");
  const [tshirtColor, setTshirtColor] = useState("#ffffff");
  const [showPrintZone, setShowPrintZone] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPreview, setSnapPreview] = useState(null);
  const [customFonts, setCustomFonts] = useState([]);
  const [printZoneSizes, setPrintZoneSizes] = useState(PRINT_ZONE_SIZES_CM);
  const [defaultTechnique, setDefaultTechnique] = useState("dtf");
  const [garmentSize, setGarmentSize] = useState("M");
  const [savedProjects, setSavedProjects] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [quoteSavedModal, setQuoteSavedModal] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [pendingQuoteDraft, setPendingQuoteDraft] = useState(null);
  const [quoteDraftBusy, setQuoteDraftBusy] = useState(false);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const actionRef = useRef(null);

  const itemImages = useItemImages(items);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const visibleItems = items.filter((item) => item.area === activeArea && !item.hidden);
  const layerItems = items
    .filter((item) => item.area === activeArea)
    .sort((a, b) => Number(b.z || 0) - Number(a.z || 0));
  const activeZoneSize = getZoneSizeCm(printZoneSizes, activeArea);
  const selectedPrintSize = selectedItem ? getItemPrintSizeCm(selectedItem, printZoneSizes) : null;
  const selectedTechnique = selectedItem ? getTechniquePreset(selectedItem) : null;
  const selectedTechniqueWarnings = selectedItem ? getTechniqueWarnings(selectedItem, printZoneSizes) : [];
  const rulerXTicks = getRulerTicks(activeZoneSize.width);
  const rulerYTicks = getRulerTicks(activeZoneSize.height);
  const snapGuides = getSnapGuides(activeArea);
  const garmentPreset = GARMENT_SIZE_PRESETS[garmentSize] || GARMENT_SIZE_PRESETS.M;

  const printTexture = useMemo(
    () => makeUvTexture(itemImages, items, tshirtColor),
    [itemImages, items, tshirtColor]
  );

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.src?.startsWith("blob:")) URL.revokeObjectURL(item.src);
      }
    };
  }, []);


  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "[]");
      setSavedProjects(Array.isArray(stored) ? stored : []);
    } catch (error) {
      console.warn("Impossible de lire les projets T-shirt sauvegardés.", error);
      setSavedProjects([]);
    }
  }, []);

  function updateItem(id, patch) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? limitItemToPrintArea({ ...item, ...patch }, printZoneSizes) : item
      )
    );
  }

  function addText() {
    const rawItem = {
      id: uid(),
      ...DEFAULT_TEXT_ITEM,
      area: activeArea,
      technique: defaultTechnique,
      layerName: "Texte",
      hidden: false,
      locked: false,
      z: Date.now(),
    };
    const item = limitItemToPrintArea(withAutoTextWidth(rawItem, printZoneSizes), printZoneSizes);
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
  }

  async function handleLogoUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const newItems = await Promise.all(files.map(async (file, index) => {
        const src = await fileToDataUrl(file);
        return limitItemToPrintArea({
          id: uid(),
          type: "image",
          area: activeArea,
          technique: defaultTechnique,
          x: clamp(0.5 + index * 0.04, 0.05, 0.95),
          y: clamp(0.38 + index * 0.04, 0.05, 0.95),
          width: Math.min(0.22, getMaxItemWidthScale(activeArea, printZoneSizes)),
          height: 0.16,
          rotation: 0,
          src,
          fileName: file.name,
          layerName: file.name,
          hidden: false,
          locked: false,
          z: Date.now() + index,
        }, printZoneSizes);
      }));

      setItems((current) => [...current, ...newItems]);
      setSelectedId(newItems[0].id);
    } catch (error) {
      console.error("Erreur import logo :", error);
      showToast("Impossible de lire un logo importé.", "error");
    }

    event.target.value = "";
  }

  async function handleFontUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const fontName = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const src = URL.createObjectURL(file);
    try {
      const dataUrl = await fileToDataUrl(file);
      const font = new FontFace(fontName, `url(${src})`);
      await font.load();
      document.fonts.add(font);
      setCustomFonts((current) => [...current, { name: fontName, src, file, dataUrl, originalName: file.name }]);
      if (selectedItem?.type === "text") updateItem(selectedItem.id, { fontFamily: fontName });
    } catch (_error) {
      showToast("Police impossible à charger. Essaie un fichier .ttf, .otf, .woff ou .woff2.", "error");
      URL.revokeObjectURL(src);
    }
    event.target.value = "";
  }

  function pointFromEvent(event) {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return null;

    // Les coordonnées de travail sont relatives à la zone pointillée, pas à tout le carré éditeur.
    const rawX = (event.clientX - rect.left) / rect.width;
    const rawY = (event.clientY - rect.top) / rect.height;

    return {
      x: clamp((rawX - EDITOR_PRINT_INSET) / EDITOR_PRINT_SIZE, 0, 1),
      y: clamp((rawY - EDITOR_PRINT_INSET) / EDITOR_PRINT_SIZE, 0, 1),
      rect,
    };
  }

  function startMove(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item || item.locked || item.hidden) return;
    actionRef.current = {
      type: "move",
      id: itemId,
      startPointer: point,
      startItem: { ...item },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startResize(event, itemId, handle = "both") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item || item.locked || item.hidden) return;
    actionRef.current = {
      type: "resize",
      handle,
      id: itemId,
      startPointer: point,
      startItem: { ...item },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const action = actionRef.current;
    if (!action) return;
    const point = pointFromEvent(event);
    if (!point) return;

    if (action.type === "move") {
      const dx = point.x - action.startPointer.x;
      const dy = point.y - action.startPointer.y;
      const nextPatch = {
        x: action.startItem.x + dx,
        y: action.startItem.y + dy,
      };
      const snapped = applySnapToPosition(action.startItem, nextPatch, snapEnabled);
      setSnapPreview(snapped.preview);
      updateItem(action.id, snapped.patch);
    }

    if (action.type === "resize") {
      setSnapPreview(null);
      const dx = point.x - action.startPointer.x;
      const dy = point.y - action.startPointer.y;
      const handle = action.handle || "both";
      const startWidth = Number(action.startItem.width || 0.22);
      const startHeight = Number(action.startItem.height || 0.16);
      const startX = Number(action.startItem.x ?? 0.5);
      const startY = Number(action.startItem.y ?? 0.5);
      const maxWidth = getMaxItemWidthScale(action.startItem.area || activeArea, printZoneSizes);
      const minWidth = 0.035;
      const minHeight = 0.025;

      let nextWidth = startWidth;
      let nextHeight = startHeight;
      let nextX = startX;
      let nextY = startY;

      if (handle === "right" || handle === "both") {
        nextWidth = clamp(startWidth + dx, minWidth, maxWidth);
        nextX = startX + (nextWidth - startWidth) / 2;
      }

      if (handle === "left") {
        nextWidth = clamp(startWidth - dx, minWidth, maxWidth);
        nextX = startX - (nextWidth - startWidth) / 2;
      }

      if (handle === "bottom" || handle === "both") {
        nextHeight = clamp(startHeight + dy, minHeight, 1);
        nextY = startY + (nextHeight - startHeight) / 2;
      }

      if (handle === "top") {
        nextHeight = clamp(startHeight - dy, minHeight, 1);
        nextY = startY - (nextHeight - startHeight) / 2;
      }

      const patch = {
        width: nextWidth,
        height: nextHeight,
        x: nextX,
        y: nextY,
      };

      // Texte : on redimensionne uniquement le cadre.
      // Le SVG du texte se met automatiquement à l’échelle du cadre,
      // ce qui évite les agrandissements brutaux et les débordements.
      if (action.startItem.type === "text") {
        delete patch.textSize;
      }

      updateItem(action.id, patch);
    }
  }

  function stopPointer() {
    actionRef.current = null;
    setSnapPreview(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const item = items.find((entry) => entry.id === selectedId);
    if (item?.src?.startsWith("blob:")) URL.revokeObjectURL(item.src);
    setItems((current) => current.filter((entry) => entry.id !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedItem) return;
    const copy = limitItemToPrintArea({
      ...selectedItem,
      id: uid(),
      x: selectedItem.x + 0.05,
      y: selectedItem.y + 0.05,
    }, printZoneSizes);
    setItems((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function updateLayer(id, patch) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function renameLayer(id, name) {
    updateLayer(id, { layerName: makeLayerName(name, defaultLayerName(items.find((item) => item.id === id))) });
  }

  function toggleLayerHidden(id) {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const hidden = !item.hidden;
      if (hidden && selectedId === id) setSelectedId(null);
      return { ...item, hidden };
    }));
  }

  function toggleLayerLocked(id) {
    updateLayer(id, { locked: !items.find((item) => item.id === id)?.locked });
  }

  function moveLayer(id, direction) {
    setItems((current) => {
      const currentZ = Number(current.find((item) => item.id === id)?.z || 0);
      const sorted = [...current].sort((a, b) => Number(a.z || 0) - Number(b.z || 0));
      const index = sorted.findIndex((item) => item.id === id);
      const swapIndex = direction === "up" ? index + 1 : index - 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return current;
      const other = sorted[swapIndex];
      return current.map((item) => {
        if (item.id === id) return { ...item, z: Number(other.z || 0) };
        if (item.id === other.id) return { ...item, z: currentZ };
        return item;
      });
    });
  }

  function updateActiveZoneSize(patch) {
    setPrintZoneSizes((current) => {
      const next = {
        ...current,
        [activeArea]: {
          ...getZoneSizeCm(current, activeArea),
          ...patch,
        },
      };

      setItems((itemsCurrent) =>
        itemsCurrent.map((item) =>
          item.area === activeArea ? limitItemToPrintArea(item, next) : item
        )
      );

      return next;
    });
  }

  function applyPrintPreset(event) {
    const preset = PRINT_SIZE_PRESETS.find((entry) => entry.label === event.target.value);
    if (!preset) return;
    updateActiveZoneSize({ width: preset.width, height: preset.height });
    event.target.value = "";
  }

  function updateSelectedRealSize(patchCm) {
    if (!selectedItem) return;
    const areaSize = getZoneSizeCm(printZoneSizes, selectedItem.area);
    const patch = {};
    if (patchCm.width !== undefined) {
      const maxWidthCm = Math.min(MAX_PRINT_WIDTH_CM, Number(areaSize.width || MAX_PRINT_WIDTH_CM));
      patch.width = clamp(Number(patchCm.width || 0) / areaSize.width, 0.01, maxWidthCm / areaSize.width);
    }
    if (patchCm.height !== undefined) {
      patch.height = clamp(Number(patchCm.height || 0) / areaSize.height, 0.01, 1);
    }
    updateItem(selectedItem.id, patch);
  }


  function persistProjects(nextProjects) {
    setSavedProjects(nextProjects);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(nextProjects));
  }

  function buildProjectSnapshot(name) {
    return {
      id: uid(),
      name: makeLayerName(name, `Projet T-shirt ${new Date().toLocaleDateString("fr-FR")}`),
      savedAt: new Date().toISOString(),
      activeArea,
      tshirtColor,
      showPrintZone,
      snapEnabled,
      defaultTechnique,
      garmentSize,
      printZoneSizes,
      items: items.map((item) => ({ ...item })),
      customFonts: customFonts.map((font) => ({
        name: font.name,
        originalName: font.originalName,
        dataUrl: font.dataUrl || font.src || null,
      })),
    };
  }

  async function restoreCustomFonts(fonts = []) {
    const restored = [];

    for (const fontInfo of fonts) {
      if (!fontInfo?.name || !fontInfo?.dataUrl) continue;
      try {
        const font = new FontFace(fontInfo.name, `url(${fontInfo.dataUrl})`);
        await font.load();
        document.fonts.add(font);
        restored.push({
          name: fontInfo.name,
          src: fontInfo.dataUrl,
          dataUrl: fontInfo.dataUrl,
          originalName: fontInfo.originalName || fontInfo.name,
        });
      } catch (error) {
        console.warn(`Police impossible à restaurer : ${fontInfo.name}`, error);
      }
    }

    setCustomFonts(restored);
  }

  function saveCurrentProject() {
    const snapshot = {
      ...buildProjectSnapshot(projectName),
      id: currentProjectId || uid(),
    };

    const nextProjects = [
      snapshot,
      ...savedProjects.filter((project) => project.id !== snapshot.id),
    ].slice(0, 30);

    persistProjects(nextProjects);
    setCurrentProjectId(snapshot.id);
    setProjectName(snapshot.name);
    showToast(`Projet sauvegardé : ${snapshot.name}`, "success");
  }

  async function loadProject(projectId) {
    const project = savedProjects.find((entry) => entry.id === projectId);
    if (!project) return;

    setCurrentProjectId(project.id);
    await restoreCustomFonts(project.customFonts || []);
    setItems((project.items || []).map((item) => limitItemToPrintArea(item, project.printZoneSizes || PRINT_ZONE_SIZES_CM)));
    setSelectedId(null);
    setActiveArea(project.activeArea || "front");
    setTshirtColor(project.tshirtColor || "#ffffff");
    setShowPrintZone(project.showPrintZone ?? true);
    setSnapEnabled(project.snapEnabled ?? true);
    setDefaultTechnique(project.defaultTechnique || "dtf");
    setGarmentSize(project.garmentSize || "M");
    setPrintZoneSizes(project.printZoneSizes || PRINT_ZONE_SIZES_CM);
    setProjectName(project.name || "");
  }

  function deleteProject(projectId) {
    const project = savedProjects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!window.confirm(`Supprimer la sauvegarde “${project.name}” ?`)) return;
    persistProjects(savedProjects.filter((entry) => entry.id !== projectId));
    if (currentProjectId === projectId) setCurrentProjectId(null);
  }

  function exportProjectJson() {
    const snapshot = buildProjectSnapshot(projectName);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${sanitizeFilename(snapshot.name)}.tshirt-project.json`);
  }

  async function importProjectJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const project = JSON.parse(text);
      const snapshot = { ...project, id: project.id || uid(), savedAt: project.savedAt || new Date().toISOString() };
      const nextProjects = [snapshot, ...savedProjects.filter((entry) => entry.id !== snapshot.id)].slice(0, 30);
      persistProjects(nextProjects);

      await restoreCustomFonts(snapshot.customFonts || []);
      setItems((snapshot.items || []).map((item) => limitItemToPrintArea(item, snapshot.printZoneSizes || PRINT_ZONE_SIZES_CM)));
      setSelectedId(null);
      setActiveArea(snapshot.activeArea || "front");
      setTshirtColor(snapshot.tshirtColor || "#ffffff");
      setShowPrintZone(snapshot.showPrintZone ?? true);
      setSnapEnabled(snapshot.snapEnabled ?? true);
      setDefaultTechnique(snapshot.defaultTechnique || "dtf");
      setGarmentSize(snapshot.garmentSize || "M");
      setPrintZoneSizes(snapshot.printZoneSizes || PRINT_ZONE_SIZES_CM);
      setProjectName(snapshot.name || "");
      setCurrentProjectId(snapshot.id);
    } catch (error) {
      console.error("Import projet impossible :", error);
      showToast("Projet impossible à importer. Vérifie le fichier JSON.", "error");
    }

    event.target.value = "";
  }

  async function buildPrintElementFiles() {
    const files = [];

    const printableItems = items
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

    for (let index = 0; index < printableItems.length; index += 1) {
      const item = printableItems[index];
      const { width, height } = getItemPrintSizeCm(item, printZoneSizes);
      const widthPx = cmToPixels(width);
      const heightPx = cmToPixels(height);
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      drawPrintItemForExport(ctx, item, itemImages[item.id], widthPx, heightPx);

      const areaLabel = PRINT_ZONES[item.area]?.label || item.area || "zone";
      const baseName = item.type === "image" ? item.fileName || "logo" : item.text || "texte";
      const techniqueLabel = getTechniquePreset(item).shortLabel;
      const filename = `impression/${String(index + 1).padStart(2, "0")}-${sanitizeFilename(areaLabel)}-${sanitizeFilename(techniqueLabel)}-${sanitizeFilename(baseName)}-${width.toFixed(1)}x${height.toFixed(1)}cm-300dpi.png`;

      files.push({ name: filename, blob: await canvasToBlob(canvas) });
    }

    return files;
  }


  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildZoneSvg(area, areaItems) {
    const zone = PRINT_ZONES[area] || PRINT_ZONES.front;
    const zoneSize = getZoneSizeCm(printZoneSizes, area);
    const zoneWidth = Number(zoneSize.width || 1);
    const zoneHeight = Number(zoneSize.height || 1);
    const title = zone.label || area;

    const parts = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${zoneWidth}cm" height="${zoneHeight}cm" viewBox="0 0 ${zoneWidth} ${zoneHeight}">`,
      `<title>${escapeXml(title)}</title>`,
      `<desc>Export vectoriel généré depuis le configurateur T-shirt. Les textes restent vectoriels. Les logos/photos importés restent intégrés en image raster.</desc>`,
      `<rect x="0" y="0" width="${zoneWidth}" height="${zoneHeight}" fill="none" stroke="#2563eb" stroke-width="0.05" stroke-dasharray="0.4 0.25"/>`,
    ];

    for (const item of areaItems) {
      const size = getItemPrintSizeCm(item, printZoneSizes);
      const itemW = Number(size.width || 0.1);
      const itemH = Number(size.height || 0.1);
      const cx = Number(item.x ?? 0.5) * zoneWidth;
      const cy = Number(item.y ?? 0.5) * zoneHeight;
      const x = cx - itemW / 2;
      const y = cy - itemH / 2;
      const rotation = Number(item.rotation || 0);
      const transform = rotation ? ` transform="rotate(${rotation} ${cx} ${cy})"` : "";

      if (item.type === "image" && item.src) {
        parts.push(
          `<image x="${x}" y="${y}" width="${itemW}" height="${itemH}" preserveAspectRatio="none" href="${escapeXml(item.src)}" xlink:href="${escapeXml(item.src)}"${transform}/>`
        );
      }

      if (item.type === "text") {
        const fontSizeCm = Math.max(0.15, itemH * 0.72);
        const strokeAttrs = item.strokeEnabled
          ? ` stroke="${escapeXml(item.strokeColor || "#000000")}" stroke-width="${Math.max(0.01, Number(item.strokeWidth || 1) * 0.015)}" paint-order="stroke" stroke-linejoin="round"`
          : "";
        const shadowStyle = item.shadowEnabled
          ? ` style="filter: drop-shadow(${Number(item.shadowOffsetX || 0) * 0.03}cm ${Number(item.shadowOffsetY || 0) * 0.03}cm ${Number(item.shadowBlur || 0) * 0.02}cm ${escapeXml(item.shadowColor || "#000000")});"`
          : "";
        const curve = Number(item.curve || 0);

        if (Math.abs(curve) > 2) {
          const pathId = `curve-${escapeXml(area)}-${escapeXml(item.id || String(Math.random()).slice(2))}`;
          const midY = cy;
          const controlY = cy - (curve / 100) * itemH * 1.25;
          parts.push(`<path id="${pathId}" d="M ${x} ${midY} Q ${cx} ${controlY} ${x + itemW} ${midY}" fill="none"/>`);
          parts.push(
            `<text font-family="${escapeXml(item.fontFamily || "Arial")}" font-size="${fontSizeCm}" font-weight="800" fill="${escapeXml(item.textColor || "#111827")}" text-anchor="middle" dominant-baseline="middle"${strokeAttrs}${shadowStyle}${transform}><textPath href="#${pathId}" startOffset="50%">${escapeXml(item.text || "Texte")}</textPath></text>`
          );
        } else {
          parts.push(
            `<text x="${cx}" y="${cy}" font-family="${escapeXml(item.fontFamily || "Arial")}" font-size="${fontSizeCm}" font-weight="800" fill="${escapeXml(item.textColor || "#111827")}" text-anchor="middle" dominant-baseline="middle"${strokeAttrs}${shadowStyle}${transform}>${escapeXml(item.text || "Texte")}</text>`
          );
        }
      }
    }

    parts.push(`</svg>`);
    return parts.join("\n");
  }

  function _buildZoneEps(area, areaItems) {
    const zone = PRINT_ZONES[area] || PRINT_ZONES.front;
    const zoneSize = getZoneSizeCm(printZoneSizes, area);
    const zoneWidthPt = Number(zoneSize.width || 1) * 28.3465;
    const zoneHeightPt = Number(zoneSize.height || 1) * 28.3465;
    const lines = [
      "%!PS-Adobe-3.0 EPSF-3.0",
      `%%Title: ${zone.label || area}`,
      `%%BoundingBox: 0 0 ${Math.ceil(zoneWidthPt)} ${Math.ceil(zoneHeightPt)}`,
      "%%Creator: AC Creation CRM - Vue3D T-shirt",
      "%%LanguageLevel: 2",
      "%%EndComments",
      "/Arial-Bold findfont 24 scalefont setfont",
      "0 0 0 setrgbcolor",
    ];

    areaItems.forEach((item) => {
      const size = getItemPrintSizeCm(item, printZoneSizes);
      const zoneWidthCm = Number(zoneSize.width || 1);
      const zoneHeightCm = Number(zoneSize.height || 1);
      const cx = Number(item.x ?? 0.5) * zoneWidthCm * 28.3465;
      const cy = zoneHeightPt - Number(item.y ?? 0.5) * zoneHeightCm * 28.3465;
      const w = Number(size.width || 0.1) * 28.3465;
      const h = Number(size.height || 0.1) * 28.3465;

      if (item.type === "text") {
        const safeText = String(item.text || "Texte").replace(/[()\\]/g, "\\$&");
        const fontSize = Math.max(6, h * 0.72);
        lines.push("gsave");
        lines.push(`${cx} ${cy} translate`);
        if (Number(item.rotation || 0)) lines.push(`${Number(item.rotation || 0)} rotate`);
        lines.push(`/Arial-Bold findfont ${fontSize.toFixed(2)} scalefont setfont`);
        lines.push(`(${safeText}) dup stringwidth pop -2 div 0 moveto show`);
        lines.push("grestore");
      } else {
        lines.push(`% Image raster intégrée dans le SVG correspondant : ${item.fileName || "logo"}`);
        lines.push("gsave");
        lines.push("0.2 0.45 1 setrgbcolor");
        lines.push(`${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} rectstroke`);
        lines.push("grestore");
      }
    });

    lines.push("showpage", "%%EOF");
    return lines.join("\n");
  }

  async function buildVectorFiles() {
    const files = [];
    const printableItems = items
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

    const areas = Object.keys(PRINT_ZONES);
    for (const area of areas) {
      const areaItems = printableItems.filter((item) => item.area === area);
      if (!areaItems.length) continue;

      const areaLabel = sanitizeFilename(PRINT_ZONES[area]?.label || area);
      const svg = buildZoneSvg(area, areaItems);
      files.push({
        name: `vectoriels/${areaLabel}.svg`,
        blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      });
    }

    const readme = [
      "Export SVG Vue3D T-shirt",
      "",
      "- Les fichiers .SVG peuvent être ouverts dans Illustrator, CorelDRAW, Inkscape, etc.",
      "- Les textes restent vectoriels dans le SVG.",
      "- Les logos/photos importés restent des images raster intégrées dans le SVG.",
      "- Pour obtenir un fichier .AI, ouvrir le SVG dans Illustrator puis enregistrer en .AI.",
    ].join("\n");

    files.push({ name: "vectoriels/README-SVG.txt", blob: new Blob([readme], { type: "text/plain;charset=utf-8" }) });
    return files;
  }

  async function buildFontFiles() {
    const fontFiles = [];

    for (let index = 0; index < customFonts.length; index += 1) {
      const font = customFonts[index];
      if (!font) continue;

      let blob = font.file;
      if (!blob && font.dataUrl) {
        blob = await fetch(font.dataUrl).then((response) => response.blob());
      }
      if (!blob) continue;

      const extension = getFontExtension(font.file || { name: font.originalName || font.name, type: blob.type });
      const filename = sanitizeFontFilename(font.originalName || font.file?.name || font.name, extension);
      fontFiles.push({
        name: `polices/${String(index + 1).padStart(2, "0")}-${filename}`,
        blob,
      });
    }

    return fontFiles;
  }


  async function buildAutoMockupFiles() {
    const files = [];
    const areaExports = [
      { area: "front", filename: "mockup-face.png", title: "Face" },
      { area: "back", filename: "mockup-dos.png", title: "Dos" },
      { area: "leftSleeve", filename: "mockup-manche-gauche.png", title: "Manche gauche" },
      { area: "rightSleeve", filename: "mockup-manche-droite.png", title: "Manche droite" },
    ];

    for (const areaExport of areaExports) {
      const areaItems = items
        .filter((item) => item.area === areaExport.area && !item.hidden)
        .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

      const isSleeve = areaExport.area === "leftSleeve" || areaExport.area === "rightSleeve";
      const canvas = document.createElement("canvas");
      canvas.width = isSleeve ? 1400 : 1600;
      canvas.height = isSleeve ? 1400 : 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Fond vêtement simple pour obtenir 4 exports différents et lisibles,
      // sans dépendre de la rotation du canvas WebGL.
      ctx.save();
      ctx.fillStyle = tshirtColor || "#ffffff";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 6;

      if (isSleeve) {
        const sleeveX = canvas.width * 0.22;
        const sleeveY = canvas.height * 0.18;
        const sleeveW = canvas.width * 0.56;
        const sleeveH = canvas.height * 0.64;
        ctx.beginPath();
        ctx.roundRect(sleeveX, sleeveY, sleeveW, sleeveH, 80);
        ctx.fill();
        ctx.stroke();
      } else {
        const w = canvas.width;
        const h = canvas.height;
        ctx.beginPath();
        ctx.moveTo(w * 0.32, h * 0.17);
        ctx.quadraticCurveTo(w * 0.42, h * 0.10, w * 0.50, h * 0.13);
        ctx.quadraticCurveTo(w * 0.58, h * 0.10, w * 0.68, h * 0.17);
        ctx.lineTo(w * 0.88, h * 0.28);
        ctx.lineTo(w * 0.78, h * 0.43);
        ctx.lineTo(w * 0.70, h * 0.37);
        ctx.lineTo(w * 0.70, h * 0.88);
        ctx.lineTo(w * 0.30, h * 0.88);
        ctx.lineTo(w * 0.30, h * 0.37);
        ctx.lineTo(w * 0.22, h * 0.43);
        ctx.lineTo(w * 0.12, h * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      const printRect = isSleeve
        ? { x: canvas.width * 0.28, y: canvas.height * 0.28, w: canvas.width * 0.44, h: canvas.height * 0.44 }
        : { x: canvas.width * 0.26, y: canvas.height * 0.24, w: canvas.width * 0.48, h: canvas.height * 0.56 };

      ctx.save();
      ctx.setLineDash([18, 12]);
      ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
      ctx.lineWidth = 4;
      ctx.strokeRect(printRect.x, printRect.y, printRect.w, printRect.h);
      ctx.restore();

      for (const item of areaItems) {
        const itemW = Math.max(20, Number(item.width || 0.22) * printRect.w);
        const itemH = Math.max(20, Number(item.height || 0.16) * printRect.h);
        const cx = printRect.x + Number(item.x ?? 0.5) * printRect.w;
        const cy = printRect.y + Number(item.y ?? 0.5) * printRect.h;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((Number(item.rotation || 0) * Math.PI) / 180);

        if (item.type === "image" && itemImages[item.id]) {
          ctx.drawImage(itemImages[item.id], -itemW / 2, -itemH / 2, itemW, itemH);
        }

        if (item.type === "text") {
          const text = String(item.text || "Texte");
          ctx.fillStyle = item.textColor || "#111827";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          let fontSize = Math.floor(itemH * 0.72);
          ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
          while (ctx.measureText(text).width > itemW * 0.92 && fontSize > 8) {
            fontSize -= 2;
            ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
          }
          ctx.fillText(text, 0, 0, itemW * 0.92);
        }

        ctx.restore();
      }

      ctx.fillStyle = "#111827";
      ctx.font = "700 42px Arial";
      ctx.textAlign = "center";
      ctx.fillText(areaExport.title, canvas.width / 2, canvas.height - 60);

      files.push({ name: areaExport.filename, blob: await canvasToBlob(canvas) });
    }

    return files;
  }

  async function buildImpressionZipBlob() {
    const files = [];
    const canvas = previewRef.current?.querySelector("canvas");

    if (canvas) {
      files.push({ name: "mockup-tshirt.png", blob: await canvasToBlob(canvas) });
    }

    files.push(...(await buildAutoMockupFiles()));
    files.push(...(await buildPrintElementFiles()));
    files.push(...(await buildVectorFiles()));
    files.push(...(await buildFontFiles()));

    if (!files.length) return null;
    return createZipBlob(files);
  }

  async function exportMockup() {
    try {
      const zipBlob = await buildImpressionZipBlob();
      if (!zipBlob) {
        showToast("Aucun fichier à exporter.", "error");
        return;
      }

      downloadBlob(zipBlob, `export-tshirt-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      console.error("Erreur export ZIP :", error);
      showToast("Export ZIP impossible. Vérifie la console pour plus de détails.", "error");
    }
  }

  function buildWorkshopPdfDocument(printableItems) {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      let y = margin;
      const todayLabel = new Date().toLocaleString("fr-FR");

      const addHeader = (title = "Fiche atelier T-shirt") => {
        pdf.setFillColor(17, 24, 39);
        pdf.rect(0, 0, pageW, 18, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text(title, margin, 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(todayLabel, pageW - margin, 12, { align: "right" });
        pdf.setTextColor(17, 24, 39);
        y = 26;
      };

      const addPageIfNeeded = (needed = 16) => {
        if (y + needed > pageH - margin) {
          pdf.addPage();
          addHeader();
        }
      };

      addHeader();

      const mockupCanvas = previewRef.current?.querySelector("canvas");
      if (mockupCanvas) {
        const imgData = mockupCanvas.toDataURL("image/png");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text("Mockup client", margin, y);
        y += 5;
        pdf.addImage(imgData, "PNG", margin, y, 86, 66, undefined, "FAST");
        y += 72;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Zones réelles", margin, y);
      y += 7;

      Object.entries(PRINT_ZONES).forEach(([key, zone]) => {
        const size = getZoneSizeCm(printZoneSizes, key);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(`${zone.label} : ${formatCm(size.width)} × ${formatCm(size.height)} cm`, margin, y);
        y += 5;
      });

      y += 4;
      addPageIfNeeded(30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Zones techniques", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      Object.entries(PRINT_ZONES).forEach(([key, zone]) => {
        addPageIfNeeded(6);
        pdf.text(`${zone.label} : ${getTechniqueSummaryForArea(printableItems, key)}`, margin, y);
        y += 5;
      });

      y += 4;
      addPageIfNeeded(25);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Éléments à imprimer", margin, y);
      y += 8;

      const headers = ["#", "Nom", "Zone", "Type", "Technique", "Taille", "Position", "Rotation"];
      const widths = [7, 34, 24, 16, 24, 27, 32, 16];
      const x0 = margin;

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      let x = x0;
      headers.forEach((head, idx) => {
        pdf.text(head, x, y);
        x += widths[idx];
      });
      y += 4;
      pdf.setDrawColor(203, 213, 225);
      pdf.line(margin, y, pageW - margin, y);
      y += 5;

      printableItems.forEach((item, index) => {
        addPageIfNeeded(12);
        const size = getItemPrintSizeCm(item, printZoneSizes);
        const zoneSize = getZoneSizeCm(printZoneSizes, item.area);
        const posXcm = Number(item.x || 0) * zoneSize.width;
        const posYcm = Number(item.y || 0) * zoneSize.height;
        const row = [
          String(index + 1),
          defaultLayerName(item).slice(0, 24),
          PRINT_ZONES[item.area]?.label || item.area || "-",
          item.type === "text" ? "Texte" : "Logo",
          getTechniquePreset(item).shortLabel,
          `${formatCm(size.width)} × ${formatCm(size.height)} cm`,
          `X ${formatCm(posXcm)} / Y ${formatCm(posYcm)} cm`,
          `${Number(item.rotation || 0).toFixed(0)}°`,
        ];

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        x = x0;
        row.forEach((cell, idx) => {
          pdf.text(String(cell), x, y, { maxWidth: widths[idx] - 2 });
          x += widths[idx];
        });
        y += 7;
      });

      y += 4;
      addPageIfNeeded(30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Polices utilisées", margin, y);
      y += 7;

      const usedFonts = Array.from(new Set(printableItems.filter((item) => item.type === "text").map((item) => item.fontFamily || "Arial")));
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      if (usedFonts.length) {
        usedFonts.forEach((font) => {
          addPageIfNeeded(6);
          const imported = customFonts.find((entry) => entry.name === font);
          pdf.text(`• ${font}${imported ? " (fichier fourni dans le ZIP)" : ""}`, margin, y);
          y += 5;
        });
      } else {
        pdf.text("Aucun texte visible.", margin, y);
        y += 5;
      }

      y += 4;
      addPageIfNeeded(24);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Notes atelier", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("• Les PNG séparés restent la source d'impression principale.", margin, y);
      y += 5;
      pdf.text("• Vérifier la zone, la taille réelle et la police avant production.", margin, y);
      y += 5;
      pdf.text("• Les calques masqués ne sont pas inclus dans l'export.", margin, y);

      return pdf;
  }

  async function buildWorkshopPdfBlob() {
    const printableItems = items
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

    if (!printableItems.length) return null;

    const pdf = buildWorkshopPdfDocument(printableItems);
    return pdf.output("blob");
  }

  async function exportWorkshopPdf() {
    try {
      const pdfBlob = await buildWorkshopPdfBlob();
      if (!pdfBlob) {
        showToast("Ajoute au moins un logo ou un texte visible avant de générer le PDF atelier.", "error");
        return;
      }

      downloadBlob(pdfBlob, `fiche-atelier-tshirt-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Erreur export PDF atelier :", error);
      showToast("Export PDF atelier impossible. Vérifie la console pour plus de détails.", "error");
    }
  }

  async function buildQuoteDraftFromProject() {
    const visibleItems = items.filter((item) => !item.hidden);
    if (!visibleItems.length) return null;

    const qty = Math.max(1, Number(orderQuantity) || 1);
    const label = projectName.trim() || `T-shirt ${garmentPreset.label}`;
    const techniqueSummary = Array.from(
      new Set(visibleItems.map((item) => getTechniquePreset(item).label))
    ).join(" / ");

    const printDetails = visibleItems.map((item) => {
      const zone = PRINT_ZONES[item.area]?.label || item.area;
      const tech = getTechniquePreset(item);
      const size = getItemPrintSizeCm(item, printZoneSizes);
      const content =
        item.type === "text"
          ? `"${item.text || "Texte"}"`
          : item.fileName || "Logo";
      const unitPrice = estimatePrintPriceHT(
        item,
        item.technique || defaultTechnique,
        size.width,
        size.height
      );
      return { zone, content, tech, size, unitPrice };
    });

    const totalUnitHT = printDetails.reduce((sum, entry) => sum + entry.unitPrice, 0);
    const markingZones = printDetails.map((entry) => entry.zone).join(", ");

    const markingPayload = printDetails.map((entry) => ({
      zone: entry.zone,
      content: entry.content,
      technique: entry.tech.shortLabel,
      width: entry.size.width,
      height: entry.size.height,
      unitPrice: entry.unitPrice,
    }));

    const baseDraft = {
      source: "configurateur t-shirt",
      calculatorProjectId: currentProjectId || "",
      notes: buildTshirtConfiguratorWorkshopNotes({
        projectName: label,
        garmentSize,
        garmentPresetLabel: garmentPreset.label,
        tshirtColor,
        techniqueSummary,
        quantity: qty,
        totalUnitHT,
        markings: markingPayload,
      }),
      lines: [
        buildCalculatorQuoteLine({
          description: buildTshirtConfiguratorQuoteDescription({ tshirtColor }),
          quantity: qty,
          priceHT: totalUnitHT,
          sku: "TSHIRT-CFG",
          category: "T-shirt",
          taille: garmentSize,
          couleur: tshirtColor,
          emplacementMarquage: markingZones,
          technique: techniqueSummary,
        }),
      ],
    };

    const [zipBlob, pdfBlob] = await Promise.all([
      withTimeout(
        buildImpressionZipBlob(),
        CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
        "Export ZIP impression : délai dépassé (60 s)."
      ).catch((error) => {
        console.warn("[Devis] Export ZIP impression:", error);
        return null;
      }),
      withTimeout(
        buildWorkshopPdfBlob(),
        CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
        "Export PDF atelier : délai dépassé (60 s)."
      ).catch((error) => {
        console.warn("[Devis] Export PDF atelier:", error);
        return null;
      }),
    ]);

    return attachConfiguratorExportsToDraft(baseDraft, { zipBlob, pdfBlob });
  }

  function notifyQuoteAttachmentResult(draft) {
    const errors = draft?.attachmentErrors || [];
    if (errors.length) {
      showToast(formatConfiguratorAttachmentErrors(errors), "warning", 8000);
      return;
    }
    const count = draft?.attachments?.length || 0;
    if (count >= 2) {
      showToast("ZIP impression et PDF atelier prêts pour le devis.", "success");
    }
  }

  async function createQuoteFromProject() {
    if (quoteDraftBusy) return;
    setQuoteDraftBusy(true);
    try {
      const draft = await buildQuoteDraftFromProject();
      if (!draft) {
        showToast("Ajoutez au moins un logo ou texte avant de créer un devis.", "error");
        return;
      }
      notifyQuoteAttachmentResult(draft);
      setPendingQuoteDraft(draft);
      setLeadModalOpen(true);
    } catch (error) {
      console.error("Erreur préparation devis :", error);
      showToast("Impossible de préparer le devis. Réessayez.", "error");
    } finally {
      setQuoteDraftBusy(false);
    }
  }

  async function openAdminQuoteWithoutLead() {
    if (quoteDraftBusy) return;
    setQuoteDraftBusy(true);
    try {
      const draft = await buildQuoteDraftFromProject();
      if (!draft) {
        showToast("Ajoutez au moins un logo ou texte avant de créer un devis.", "error");
        return;
      }
      notifyQuoteAttachmentResult(draft);
      openQuoteFromCalculator(navigate, draft);
      const attachmentCount = draft.attachments?.length || 0;
      const hasErrors = (draft.attachmentErrors || []).length > 0;
      if (!hasErrors) {
        showToast(
          attachmentCount
            ? `Devis pré-rempli avec ${attachmentCount} fichier(s) export(s).`
            : "Devis pré-rempli (sans lead sur le tableau de bord).",
          "success"
        );
      }
    } catch (error) {
      console.error("Erreur Devis rapide :", error);
      showToast("Impossible d'ouvrir le devis rapide.", "error");
    } finally {
      setQuoteDraftBusy(false);
    }
  }

  async function submitPublicLeadAndQuote(event) {
    event.preventDefault();
    if (!pendingQuoteDraft) return;

    setLeadSubmitting(true);
    try {
      await submitPublicLead({
        email: leadEmail,
        phone: leadPhone,
        source: "configurateur-tshirt",
        metadata: {
          projectName: projectName.trim() || "T-shirt configuré",
          quantity: orderQuantity,
          color: tshirtColor,
          size: garmentSize,
        },
      });
      saveQuoteDraft(pendingQuoteDraft);
      setLeadModalOpen(false);
      setLeadEmail("");
      setLeadPhone("");

      if (isPublicConfigurator) {
        setQuoteSavedModal(true);
        showToast(
          "Merci ! Votre projet est enregistré. Ouvrez le CRM → Devis pour finaliser.",
          "success",
          7000
        );
      } else {
        openQuoteFromCalculator(navigate, pendingQuoteDraft);
        showToast(
          "Contact enregistré — devis pré-rempli. Le lead apparaît sur le tableau de bord.",
          "success"
        );
      }
      setPendingQuoteDraft(null);
    } catch (error) {
      showToast(error.message || "Impossible d'enregistrer votre contact.", "error");
    } finally {
      setLeadSubmitting(false);
    }
  }

  return (
    <section>
      {isPublicConfigurator ? (
        <div className="tshirt3d-public-banner">
          <div>
            <strong>Configurateur public AC Creation</strong>
            <p>Créez votre visuel, puis cliquez sur « Créer un devis ». Laissez votre email pour être recontacté.</p>
          </div>
          <a className="tshirt3d-public-crm-link" href={getCrmQuotesUrl()}>
            Ouvrir le CRM → Devis
          </a>
        </div>
      ) : null}

      {leadModalOpen ? (
        <div className="tshirt3d-quote-modal" role="dialog" aria-labelledby="tshirt-lead-modal-title">
          <div className="tshirt3d-quote-modal-card">
            <h3 id="tshirt-lead-modal-title">
              {isPublicConfigurator ? "Recevoir votre devis" : "Contact client"}
            </h3>
            <p>
              {isPublicConfigurator
                ? "Laissez votre email pour enregistrer le projet et être recontacté par AC Creation."
                : "Indiquez l'email du client pour créer un lead sur le tableau de bord et ouvrir le devis pré-rempli."}
            </p>
            <form className="tshirt3d-lead-form" onSubmit={submitPublicLeadAndQuote}>
              <label>
                Email *
                <input
                  type="email"
                  required
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                  placeholder="vous@exemple.com"
                  data-testid="public-lead-email"
                />
              </label>
              <label>
                Téléphone (optionnel)
                <input
                  type="tel"
                  value={leadPhone}
                  onChange={(event) => setLeadPhone(event.target.value)}
                  placeholder="+352 …"
                />
              </label>
              <div className="tshirt3d-quote-modal-actions">
                <button type="submit" className="primary" disabled={leadSubmitting}>
                  {leadSubmitting
                    ? "Envoi…"
                    : isPublicConfigurator
                      ? "Enregistrer mon projet"
                      : "Enregistrer et ouvrir le devis"}
                </button>
                <button type="button" onClick={() => setLeadModalOpen(false)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {quoteSavedModal ? (
        <div className="tshirt3d-quote-modal" role="dialog" aria-labelledby="tshirt-quote-modal-title">
          <div className="tshirt3d-quote-modal-card">
            <h3 id="tshirt-quote-modal-title">Projet prêt pour le devis</h3>
            <p>
              Le configurateur a enregistré votre projet dans ce navigateur. Connectez-vous au CRM
              sur la page <strong>Devis</strong> pour retrouver les lignes pré-remplies.
            </p>
            <p className="muted">Utilisez le même navigateur (Chrome, Edge, etc.) que celui-ci.</p>
            <div className="tshirt3d-quote-modal-actions">
              <a className="primary" href={getCrmQuotesUrl()}>
                Ouvrir AC Creation CRM → Devis
              </a>
              <button type="button" onClick={() => setQuoteSavedModal(false)}>
                Continuer le design
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-header">
        <div>
          <h2>👕 T-shirt 3D</h2>
          <p>Multi logos, textes, manches et polices personnalisées.</p>
        </div>
        <div className="tshirt3d-export-actions">
          <button type="button" onClick={createQuoteFromProject} disabled={quoteDraftBusy}>
            {quoteDraftBusy ? "Préparation du devis…" : "Créer un devis"}
          </button>
          {!isPublicConfigurator ? (
            <button
              type="button"
              className="ghost"
              onClick={openAdminQuoteWithoutLead}
              disabled={quoteDraftBusy}
            >
              {quoteDraftBusy ? "Préparation…" : "Devis rapide"}
            </button>
          ) : null}
          <button className="primary" onClick={exportMockup}>Exporter ZIP impression</button>
          <button type="button" onClick={exportWorkshopPdf}>Exporter PDF atelier</button>
        </div>
      </div>

      <div className="tshirt3d-layout">
        <div className="card tshirt3d-preview-card">
          <div className="tshirt3d-preview" ref={previewRef}>
            <Product3DErrorBoundary
              resetKey={MODEL_URL}
              title="Aperçu 3D indisponible"
              message="Impossible de charger le modèle du t-shirt. Rechargez la page (Ctrl+F5) ou relancez l'application après un rebuild."
            >
              <Canvas shadows camera={{ position: [0, 0.35, 3.2], fov: 42 }} gl={{ preserveDrawingBuffer: true }}>
                <ambientLight intensity={0.9} />
                <directionalLight position={[2, 3, 4]} intensity={1.8} castShadow />
                <Suspense fallback={null}>
                  <Bounds fit clip observe margin={1.15}>
                    <Center>
                      <TshirtModel texture={printTexture} garmentScale={garmentPreset.scale} />
                    </Center>
                  </Bounds>
                  <Environment preset="studio" />
                </Suspense>
                <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
              </Canvas>
            </Product3DErrorBoundary>
            <div className="tshirt3d-hint">Souris : tourner · molette : zoom</div>
          </div>
        </div>

        <div className="card tshirt3d-editor-card">
          <h3>Personnalisation</h3>

          <div className="tshirt3d-form-grid">
            <label>
              Couleur textile
              <input type="color" value={tshirtColor} onChange={(e) => setTshirtColor(e.target.value)} />
            </label>
            <label>
              Zone à modifier
              <select value={activeArea} onChange={(e) => { setActiveArea(e.target.value); setSelectedId(null); }}>
                {Object.entries(PRINT_ZONES).map(([key, zone]) => <option key={key} value={key}>{zone.label}</option>)}
              </select>
            </label>
            <label>
              Format zone
              <select defaultValue="" onChange={applyPrintPreset}>
                <option value="" disabled>Choisir A4 / A3 / DTF</option>
                {PRINT_SIZE_PRESETS.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
              </select>
            </label>
            <label>
              Technique par défaut
              <select value={defaultTechnique} onChange={(e) => setDefaultTechnique(e.target.value)}>
                {TECHNIQUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Taille vêtement
              <select value={garmentSize} onChange={(e) => setGarmentSize(e.target.value)}>
                {GARMENT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{GARMENT_SIZE_PRESETS[size].label}</option>)}
              </select>
            </label>
          </div>

          <div className="tshirt3d-size-panel">
            <div className="tshirt3d-size-header">
              <strong>Taille vêtement : {garmentPreset.label}</strong>
              <span>Largeur poitrine env. {garmentPreset.chest} cm · hauteur env. {garmentPreset.length} cm</span>
            </div>
            <div className="tshirt3d-size-scale">
              {GARMENT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={size === garmentSize ? "active" : ""}
                  onClick={() => setGarmentSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="muted">{garmentPreset.note} Les dimensions d’impression restent celles définies en cm : seul l’aperçu 3D change pour visualiser les proportions.</p>
          </div>

          <div className="tshirt3d-tech-panel">
            <strong>Zones techniques atelier</strong>
            <div className="tshirt3d-tech-grid">
              {Object.entries(TECHNIQUE_PRESETS).map(([key, preset]) => (
                <div key={key} className={`tshirt3d-tech-card technique-${key}`}>
                  <span className="tshirt3d-tech-badge">{preset.label}</span>
                  <p>{preset.help}</p>
                  <small>Minimum : {formatCm(preset.minWidth)} × {formatCm(preset.minHeight)} cm{preset.maxWidth ? ` · Max conseillé : ${formatCm(preset.maxWidth)} × ${formatCm(preset.maxHeight)} cm` : ""}</small>
                  <em>{preset.note}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="tshirt3d-project-panel">
            <div className="tshirt3d-project-header">
              <strong>Sauvegarde projet client</strong>
              <span>{savedProjects.length} sauvegarde{savedProjects.length > 1 ? "s" : ""}</span>
            </div>
            <div className="tshirt3d-project-controls">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Nom client / commande"
              />
              <label className="tshirt3d-qty-field">
                Qté
                <input
                  type="number"
                  min="1"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value)}
                />
              </label>
              <button type="button" onClick={saveCurrentProject}>Sauvegarder</button>
              <button type="button" onClick={exportProjectJson}>Exporter projet</button>
              <label className="tshirt3d-project-import">
                Importer projet
                <input type="file" accept="application/json,.json" onChange={importProjectJson} />
              </label>
            </div>
            {savedProjects.length ? (
              <div className="tshirt3d-project-list">
                {savedProjects.map((project) => (
                  <div key={project.id} className="tshirt3d-project-row">
                    <div>
                      <strong>{project.name}</strong>
                      <small>{new Date(project.savedAt).toLocaleString("fr-FR")}</small>
                    </div>
                    <button type="button" onClick={() => loadProject(project.id)}>Reprendre</button>
                    <button type="button" className="danger" onClick={() => deleteProject(project.id)}>Supprimer</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Aucun projet sauvegardé pour le moment.</p>
            )}
          </div>

          <div className="tshirt3d-real-size-panel">
            <strong>Zone réelle : {PRINT_ZONES[activeArea]?.label} — {formatCm(activeZoneSize.width)} × {formatCm(activeZoneSize.height)} cm</strong>
            <div className="tshirt3d-real-size-fields">
              <label>
  Largeur zone (cm)
  <input
    type="number"
    value={activeZoneSize.width}
    readOnly
    disabled
  />
</label>

<label>
  Hauteur zone (cm)
  <input
    type="number"
    value={activeZoneSize.height}
    readOnly
    disabled
  />
</label>
            </div>
          </div>

          <div className="tshirt3d-toolbar">
            <label className="tshirt3d-upload-button">
              Ajouter logo(s)
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} />
            </label>
            <button onClick={addText}>Ajouter un texte</button>
            <label className="tshirt3d-upload-button secondary">
              Importer police
              <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} />
            </label>
            <button disabled={!selectedItem} onClick={duplicateSelected}>Dupliquer</button>
            <button className="danger" disabled={!selectedItem || selectedItem.locked} onClick={deleteSelected}>Supprimer</button>
          </div>

          <div className="tshirt3d-align-tools">
            <label className="tshirt3d-checkbox compact">
              <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
              Aimants d’alignement
            </label>
            <span>Repères : centre, poitrine, col et centre manche.</span>
          </div>

          <div className="tshirt3d-layers-panel">
            <div className="tshirt3d-layers-header">
              <strong>Calques</strong>
              <span>{layerItems.length} élément{layerItems.length > 1 ? "s" : ""} dans {PRINT_ZONES[activeArea]?.label}</span>
            </div>
            {layerItems.length ? (
              <div className="tshirt3d-layers-list">
                {layerItems.map((item) => (
                  <div
                    key={item.id}
                    className={`tshirt3d-layer-row ${item.id === selectedId ? "active" : ""} ${item.hidden ? "is-hidden" : ""} ${item.locked ? "is-locked" : ""}`}
                  >
                    <button
                      type="button"
                      className="tshirt3d-layer-select"
                      onClick={() => { if (!item.hidden) setSelectedId(item.id); }}
                      title="Sélectionner le calque"
                    >
                      <span className="tshirt3d-layer-type">{item.type === "image" ? "🖼️" : "T"}</span>
                    </button>
                    <span className="tshirt3d-layer-tech">{getTechniquePreset(item).shortLabel}</span>
                    <input
                      className="tshirt3d-layer-name"
                      value={defaultLayerName(item)}
                      onChange={(e) => renameLayer(item.id, e.target.value)}
                      title="Renommer le calque"
                    />
                    <button type="button" onClick={() => toggleLayerHidden(item.id)} title={item.hidden ? "Afficher" : "Masquer"}>
                      {item.hidden ? "🙈" : "👁"}
                    </button>
                    <button type="button" onClick={() => toggleLayerLocked(item.id)} title={item.locked ? "Déverrouiller" : "Verrouiller"}>
                      {item.locked ? "🔒" : "🔓"}
                    </button>
                    <button type="button" onClick={() => moveLayer(item.id, "up")} title="Monter le calque">↑</button>
                    <button type="button" onClick={() => moveLayer(item.id, "down")} title="Descendre le calque">↓</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Aucun calque dans cette zone.</p>
            )}
          </div>

          <div
            className="tshirt3d-zone-editor"
            ref={editorRef}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPointer}
            onPointerCancel={stopPointer}
            onPointerLeave={stopPointer}
            onPointerDown={() => setSelectedId(null)}
          >
            <div className="tshirt3d-ruler tshirt3d-ruler-x">
              {rulerXTicks.map((tick) => <span key={`x-${tick.value}`} style={{ left: `${tick.percent}%` }}>{formatCm(tick.value)}</span>)}
            </div>
            <div className="tshirt3d-ruler tshirt3d-ruler-y">
              {rulerYTicks.map((tick) => <span key={`y-${tick.value}`} style={{ top: `${tick.percent}%` }}>{formatCm(tick.value)}</span>)}
            </div>
            <div className="tshirt3d-ruler-label">cm</div>
            {snapEnabled && snapGuides.x.map((guide) => (
              <div
                key={`snap-x-${guide.label}`}
                className={`tshirt3d-snap-line tshirt3d-snap-line-x ${snapPreview?.x?.value === guide.value ? "active" : ""}`}
                style={{ left: `${(EDITOR_PRINT_INSET + guide.value * EDITOR_PRINT_SIZE) * 100}%` }}
              >
                <span>{guide.label}</span>
              </div>
            ))}
            {snapEnabled && snapGuides.y.map((guide) => (
              <div
                key={`snap-y-${guide.label}`}
                className={`tshirt3d-snap-line tshirt3d-snap-line-y ${snapPreview?.y?.value === guide.value ? "active" : ""}`}
                style={{ top: `${(EDITOR_PRINT_INSET + guide.value * EDITOR_PRINT_SIZE) * 100}%` }}
              >
                <span>{guide.label}</span>
              </div>
            ))}
            {showPrintZone && <div className={`tshirt3d-zone-border area-${activeArea}`} />}
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className={`tshirt3d-design technique-${item.technique || "dtf"} ${item.id === selectedId ? "selected" : ""} ${item.locked ? "locked" : ""}`}
                onPointerDown={(event) => startMove(event, item.id)}
                style={{
                  left: `${(EDITOR_PRINT_INSET + item.x * EDITOR_PRINT_SIZE) * 100}%`,
                  top: `${(EDITOR_PRINT_INSET + item.y * EDITOR_PRINT_SIZE) * 100}%`,
                  width: `${item.width * EDITOR_PRINT_SIZE * 100}%`,
                  height: `${(item.height || 0.16) * EDITOR_PRINT_SIZE * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
                }}
              >
                {item.type === "image" ? (
                  <img src={item.src} alt={item.fileName || "Logo"} />
                ) : (
                  <svg
                    className="tshirt3d-text-svg"
                    viewBox="0 0 1000 240"
                    preserveAspectRatio="none"
                    aria-label={item.text || "Texte"}
                  >
                    {item.shadowEnabled && (
                      <defs>
                        <filter id={`text-shadow-${item.id}`} x="-30%" y="-60%" width="160%" height="220%">
                          <feDropShadow
                            dx={Number(item.shadowOffsetX || 0)}
                            dy={Number(item.shadowOffsetY || 0)}
                            stdDeviation={Math.max(0, Number(item.shadowBlur || 0)) / 3}
                            floodColor={item.shadowColor || "#000000"}
                            floodOpacity="0.85"
                          />
                        </filter>
                      </defs>
                    )}
                    {Math.abs(Number(item.curve || 0)) > 2 ? (
                      <>
                        <defs>
                          <path
                            id={`text-curve-${item.id}`}
                            d={`M 80 120 Q 500 ${120 - Number(item.curve || 0) * 1.05} 920 120`}
                          />
                        </defs>
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={item.textColor || "#111827"}
                          stroke={item.strokeEnabled ? item.strokeColor || "#000000" : "none"}
                          strokeWidth={item.strokeEnabled ? Number(item.strokeWidth || 2) : 0}
                          paintOrder="stroke"
                          strokeLinejoin="round"
                          fontFamily={item.fontFamily || "Arial"}
                          fontWeight="900"
                          fontSize="145"
                          filter={item.shadowEnabled ? `url(#text-shadow-${item.id})` : undefined}
                        >
                          <textPath href={`#text-curve-${item.id}`} startOffset="50%">
                            {item.text || "Texte"}
                          </textPath>
                        </text>
                      </>
                    ) : (
                      <text
                        x="500"
                        y="120"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={item.textColor || "#111827"}
                        stroke={item.strokeEnabled ? item.strokeColor || "#000000" : "none"}
                        strokeWidth={item.strokeEnabled ? Number(item.strokeWidth || 2) : 0}
                        paintOrder="stroke"
                        strokeLinejoin="round"
                        fontFamily={item.fontFamily || "Arial"}
                        fontWeight="900"
                        fontSize="165"
                        textLength="900"
                        lengthAdjust="spacingAndGlyphs"
                        filter={item.shadowEnabled ? `url(#text-shadow-${item.id})` : undefined}
                      >
                        {item.text || "Texte"}
                      </text>
                    )}
                  </svg>
                )}
                <button className="tshirt3d-resize-handle left" onPointerDown={(event) => startResize(event, item.id, "left")} title="Étirer gauche / largeur" />
                <button className="tshirt3d-resize-handle right" onPointerDown={(event) => startResize(event, item.id, "right")} title="Étirer droite / largeur" />
                <button className="tshirt3d-resize-handle top" onPointerDown={(event) => startResize(event, item.id, "top")} title="Étirer haut / hauteur" />
                <button className="tshirt3d-resize-handle bottom" onPointerDown={(event) => startResize(event, item.id, "bottom")} title="Étirer bas / hauteur" />
                <button className="tshirt3d-resize-handle both" onPointerDown={(event) => startResize(event, item.id, "both")} title="Largeur + hauteur" />
              </div>
            ))}
          </div>

          {selectedItem ? (
            <div className="tshirt3d-selected-panel">
              <strong>Élément sélectionné : {defaultLayerName(selectedItem)} {selectedItem.locked ? "— verrouillé" : ""}</strong>
              {selectedTechnique && (
                <div className="tshirt3d-tech-selected">
                  <label>
                    Technique atelier
                    <select value={selectedItem.technique || "dtf"} onChange={(e) => updateItem(selectedItem.id, { technique: e.target.value })}>
                      {TECHNIQUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <p>{selectedTechnique.help}</p>
                  <small>{selectedTechnique.note}</small>
                  {selectedTechniqueWarnings.length > 0 && (
                    <div className="tshirt3d-tech-warnings">
                      {selectedTechniqueWarnings.map((warning) => <div key={warning}>⚠️ {warning}</div>)}
                    </div>
                  )}
                </div>
              )}
              {selectedItem.type === "text" && (
                <div className="tshirt3d-form-grid">
                  <label>Texte<input value={selectedItem.text || ""} onChange={(e) => {
                    const nextText = e.target.value;
                    updateItem(selectedItem.id, withAutoTextWidth({ ...selectedItem, text: nextText }, printZoneSizes));
                  }} /></label>
                  <label>Couleur<input type="color" value={selectedItem.textColor || "#111827"} onChange={(e) => updateItem(selectedItem.id, { textColor: e.target.value })} /></label>
                  <label>Police
                    <select value={selectedItem.fontFamily || "Arial"} onChange={(e) => {
                      const nextFontFamily = e.target.value;
                      updateItem(selectedItem.id, withAutoTextWidth({ ...selectedItem, fontFamily: nextFontFamily }, printZoneSizes));
                    }}>
                      <option value="Arial">Arial</option>
                      <option value="Impact">Impact</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Verdana">Verdana</option>
                      {customFonts.map((font) => <option key={font.name} value={font.name}>{font.name}</option>)}
                    </select>
                  </label>
                  <label>Courbure
                    <input type="range" min="-100" max="100" step="1" value={selectedItem.curve || 0} onChange={(e) => updateItem(selectedItem.id, { curve: Number(e.target.value) })} />
                  </label>
                  <label className="tshirt3d-checkbox compact">
                    <input type="checkbox" checked={selectedItem.strokeEnabled || false} onChange={(e) => updateItem(selectedItem.id, { strokeEnabled: e.target.checked })} />
                    Contour texte
                  </label>
                  {selectedItem.strokeEnabled && (
                    <>
                      <label>Couleur contour<input type="color" value={selectedItem.strokeColor || "#000000"} onChange={(e) => updateItem(selectedItem.id, { strokeColor: e.target.value })} /></label>
                      <label>Épaisseur contour<input type="range" min="1" max="20" step="1" value={selectedItem.strokeWidth || 2} onChange={(e) => updateItem(selectedItem.id, { strokeWidth: Number(e.target.value) })} /></label>
                    </>
                  )}
                  <label className="tshirt3d-checkbox compact">
                    <input type="checkbox" checked={selectedItem.shadowEnabled || false} onChange={(e) => updateItem(selectedItem.id, { shadowEnabled: e.target.checked })} />
                    Ombre texte
                  </label>
                  {selectedItem.shadowEnabled && (
                    <>
                      <label>Couleur ombre<input type="color" value={selectedItem.shadowColor || "#000000"} onChange={(e) => updateItem(selectedItem.id, { shadowColor: e.target.value })} /></label>
                      <label>Flou ombre<input type="range" min="0" max="30" step="1" value={selectedItem.shadowBlur || 8} onChange={(e) => updateItem(selectedItem.id, { shadowBlur: Number(e.target.value) })} /></label>
                      <label>Décalage X<input type="range" min="-30" max="30" step="1" value={selectedItem.shadowOffsetX || 4} onChange={(e) => updateItem(selectedItem.id, { shadowOffsetX: Number(e.target.value) })} /></label>
                      <label>Décalage Y<input type="range" min="-30" max="30" step="1" value={selectedItem.shadowOffsetY || 4} onChange={(e) => updateItem(selectedItem.id, { shadowOffsetY: Number(e.target.value) })} /></label>
                    </>
                  )}
                </div>
              )}
              {selectedPrintSize && (
                <div className="tshirt3d-selected-size-box">
                  <strong>Taille réelle impression : {formatCm(selectedPrintSize.width)} × {formatCm(selectedPrintSize.height)} cm</strong>
                  <p className="muted">Largeur max autorisée : {formatCm(Math.min(MAX_PRINT_WIDTH_CM, getZoneSizeCm(printZoneSizes, selectedItem.area).width))} cm. L’élément reste dans la zone pointillée.</p>
                  <div className="tshirt3d-real-size-fields">
                    <label>Largeur élément (cm)<input type="number" min="0.1" step="0.1" value={Number(selectedPrintSize.width.toFixed(1))} onChange={(e) => updateSelectedRealSize({ width: Number(e.target.value) })} /></label>
                    <label>Hauteur élément (cm)<input type="number" min="0.1" step="0.1" value={Number(selectedPrintSize.height.toFixed(1))} onChange={(e) => updateSelectedRealSize({ height: Number(e.target.value) })} /></label>
                  </div>
                </div>
              )}
              <div className="tshirt3d-controls">
                <label>Largeur<input type="range" min="0.035" max={getMaxItemWidthScale(selectedItem.area, printZoneSizes)} step="0.005" value={selectedItem.width} onChange={(e) => updateItem(selectedItem.id, { width: Number(e.target.value) })} /></label>
                <label>Hauteur<input type="range" min="0.025" max="1" step="0.005" value={selectedItem.height || 0.16} onChange={(e) => updateItem(selectedItem.id, { height: Number(e.target.value) })} /></label>
                <label>Rotation<input type="range" min="-180" max="180" step="1" value={selectedItem.rotation || 0} onChange={(e) => updateItem(selectedItem.id, { rotation: Number(e.target.value) })} /></label>
                <label>Déplacer vers
                  <select value={selectedItem.area} onChange={(e) => { updateItem(selectedItem.id, { area: e.target.value, x: 0.5, y: 0.38 }); setActiveArea(e.target.value); }}>
                    {Object.entries(PRINT_ZONES).map(([key, zone]) => <option key={key} value={key}>{zone.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <p className="muted">Clique sur un logo ou un texte pour le déplacer, le redimensionner, le tourner ou le modifier.</p>
          )}

          <label className="tshirt3d-checkbox">
            <input type="checkbox" checked={showPrintZone} onChange={(e) => setShowPrintZone(e.target.checked)} />
            Afficher la zone d'impression dans l'éditeur
          </label>
        </div>
      </div>
    </section>
  );
}

useGLTF.preload(MODEL_URL);
