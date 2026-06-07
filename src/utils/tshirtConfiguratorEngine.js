import { useEffect, useState } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { PRODUCT_CONFIGS } from "./productConfigs";

// Fallbacks module-level pour les fonctions utilitaires (shadowés par le composant via productConfig)
const PRINT_ZONES = PRODUCT_CONFIGS.tshirt.printZones;
const PRINT_ZONE_SIZES_CM = PRODUCT_CONFIGS.tshirt.printZoneSizesCm;

export const TEXTURE_SIZE = 2048;

// Limites de travail dans l'éditeur : le visuel reste dans la zone pointillée.
export const MAX_PRINT_WIDTH_CM = 29;
export const EDITOR_PRINT_INSET = 0.07;
export const EDITOR_PRINT_SIZE = 1 - EDITOR_PRINT_INSET * 2;
export const SNAP_THRESHOLD = 0.025;

export const TECHNIQUE_PRESETS = {
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

export const TECHNIQUE_OPTIONS = Object.entries(TECHNIQUE_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label,
}));

export const EXPORT_DPI = 300;
export const CM_TO_INCH = 1 / 2.54;

export const DEFAULT_TEXT_ITEM = {
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

export const PROJECTS_STORAGE_KEY = "ac-creation-tshirt-projects-v1";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function defaultLayerName(item) {
  if (item?.layerName) return item.layerName;
  if (item?.type === "text") return item.text || "Texte";
  return item?.fileName || "Logo";
}

export function makeLayerName(value, fallback = "Calque") {
  const name = String(value || "").trim();
  return name || fallback;
}

export function cmToPixels(cm) {
  return Math.max(1, Math.round(Number(cm || 0) * CM_TO_INCH * EXPORT_DPI));
}

export function formatCm(value) {
  return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

export function getZoneSizeCm(zoneSizes, area) {
  return zoneSizes?.[area] || PRINT_ZONE_SIZES_CM[area] || PRINT_ZONE_SIZES_CM.front;
}

export function getMaxItemWidthScale(area, zoneSizes) {
  const zoneSize = getZoneSizeCm(zoneSizes, area);
  return Math.min(1, MAX_PRINT_WIDTH_CM / Math.max(1, Number(zoneSize.width || 1)));
}

export function limitItemToPrintArea(item, zoneSizes) {
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

export function estimateTextWidthScale(item, zoneSizes) {
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

export function withAutoTextWidth(item, zoneSizes) {
  if (item?.type !== "text") return item;
  return {
    ...item,
    width: estimateTextWidthScale(item, zoneSizes),
  };
}

export function getRulerTicks(totalCm, maxTicks = 12) {
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

export function getSnapGuides(area, snapGuidesConfig) {
  // Si une config produit est fournie, on l'utilise
  if (snapGuidesConfig?.[area]) return snapGuidesConfig[area];

  // Fallback : comportement d'origine (t-shirt)
  const sleeve = area === "leftSleeve" || area === "rightSleeve";
  if (sleeve) {
    return {
      x: [{ value: 0.5, label: "Centre manche" }],
      y: [{ value: 0.5, label: "Milieu manche" }],
    };
  }
  return {
    x: [{ value: 0.5, label: "Centre" }],
    y: [
      { value: 0.18, label: "Col" },
      { value: 0.35, label: "Poitrine" },
      { value: 0.5,  label: "Milieu" },
    ],
  };
}

export function snapValue(value, guides, threshold = SNAP_THRESHOLD) {
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

export function applySnapToPosition(item, patch, enabled = true, snapGuidesConfig) {
  if (!enabled) return { patch, preview: null };

  const guides = getSnapGuides(item.area || "front", snapGuidesConfig);
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

export function sanitizeFilename(value) {
  return String(value || "element")
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "element";
}

export function sanitizeFontFilename(value, fallbackExtension = ".ttf") {
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

export function getFontExtension(file) {
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

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Export PNG impossible."));
    }, "image/png");
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

export function downloadBlob(blob, filename) {
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

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function dateToDosTime(date = new Date()) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

export async function createZipBlob(files) {
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

export function getItemPrintSizeCm(item, zoneSizes = PRINT_ZONE_SIZES_CM) {
  const areaSize = getZoneSizeCm(zoneSizes, item.area);
  return {
    width: Math.max(0.1, Number(item.width || 0.22) * areaSize.width),
    height: Math.max(0.1, Number(item.height || 0.16) * areaSize.height),
  };
}

export function getTechniquePreset(itemOrValue) {
  const key = typeof itemOrValue === "string" ? itemOrValue : itemOrValue?.technique;
  return TECHNIQUE_PRESETS[key] || TECHNIQUE_PRESETS.dtf;
}

export function getTechniqueWarnings(item, zoneSizes = PRINT_ZONE_SIZES_CM) {
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

export function getTechniqueSummaryForArea(items, area) {
  const techniques = Array.from(new Set((items || [])
    .filter((item) => item.area === area && !item.hidden)
    .map((item) => getTechniquePreset(item).shortLabel)));
  return techniques.length ? techniques.join(" / ") : "Aucune";
}

export function drawTextWithEffects(ctx, item, text, maxWidth, maxHeight) {
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

export function drawPrintItemForExport(ctx, item, logoImage, widthPx, heightPx) {
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

export function useItemImages(items) {
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

export function drawItem(ctx, item, zone, logoImage, uvFlipY = false) {
  const zoneX = zone.x * TEXTURE_SIZE;
  const zoneY = zone.y * TEXTURE_SIZE;
  const zoneW = zone.w * TEXTURE_SIZE;
  const zoneH = zone.h * TEXTURE_SIZE;

  const itemX = clamp(Number(item.x ?? 0.5), 0, 1);
  const itemY = clamp(Number(item.y ?? 0.5), 0, 1);
  const cx = zoneX + itemX * zoneW;
  // uvFlipY=true : le modèle a V=0 en bas → annuler le (1-y) du t-shirt
  const cy = zoneY + (uvFlipY ? itemY : (1 - itemY)) * zoneH;

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

export function makeUvTexture(itemImages, items, tshirtColor, baseImage = null, uvFlipY = false) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (baseImage) {
    // Fond = texture originale du produit (polo, etc.)
    ctx.drawImage(baseImage, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    // Teinte couleur textile en mode multiply léger (optionnel)
    if (tshirtColor && tshirtColor !== "#ffffff") {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = tshirtColor;
      ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = tshirtColor || "#ffffff";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }

  const drawableItems = items
    .filter((item) => !item.hidden)
    .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

  for (const item of drawableItems) {
    const zone = PRINT_ZONES[item.area] || PRINT_ZONES.front;
    drawItem(ctx, item, zone, itemImages[item.id], uvFlipY);
  }

  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;

  // RepeatWrapping : les UV négatifs wrappent dans 0-1 (ex: -0.5 → 0.5)
  // Nécessaire pour les modèles Sketchfab/CLO3D avec UV hors 0-1
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  texture.needsUpdate = true;
  return texture;
}
