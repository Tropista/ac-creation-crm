import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import jsPDF from "jspdf";
import "./Vue3DTshirt.css";

const MODEL_URL = `${import.meta.env.BASE_URL}models/tshirt/t-shirt.gltf`;
const BASE_COLOR_URL = `${import.meta.env.BASE_URL}models/tshirt/textures/Material.001_baseColor.png`;
const NORMAL_URL = `${import.meta.env.BASE_URL}models/tshirt/textures/Material.001_normal.png`;
const ROUGHNESS_URL = `${import.meta.env.BASE_URL}models/tshirt/textures/Material.001_metallicRoughness.png`;

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
};

// Point 6 : vues automatiques réelles du t-shirt.
// On garde la caméra de face et on tourne le modèle pendant l'export,
// ce qui évite de capturer plusieurs fois la même vue si OrbitControls/Bounds conserve l'ancien angle.
const TSHIRT_EXPORT_VIEWS = {
  front: { rotationY: 0, filename: "mockup-face.png" },
  back: { rotationY: Math.PI, filename: "mockup-dos.png" },
  leftSleeve: { rotationY: Math.PI / 2, filename: "mockup-manche-gauche.png" },
  rightSleeve: { rotationY: -Math.PI / 2, filename: "mockup-manche-droite.png" },
};

function waitForRender(ms = 260) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, ms));
    });
  });
}


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

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
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
    const text = String(item.text || "Texte");
    ctx.fillStyle = item.textColor || "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let fontSize = Math.floor(heightPx * 0.72);
    ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;

    while (ctx.measureText(text).width > widthPx * 0.92 && fontSize > 8) {
      fontSize -= 2;
      ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
    }

    ctx.fillText(text, 0, 0, widthPx * 0.92);
  }

  ctx.restore();
}

function useImage(url) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!url) return setImage(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.src = url;
  }, [url]);
  return image;
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
    ctx.fillStyle = item.textColor || "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Number(item.textSize || 74)}px "${item.fontFamily || "Arial"}"`;
    ctx.fillText(String(item.text || "Texte"), 0, 0, drawW);
  }

  ctx.restore();
}

function makeUvTexture(baseImage, itemImages, items, tshirtColor) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = tshirtColor || "#ffffff";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  if (baseImage) {
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(baseImage, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    ctx.globalCompositeOperation = "source-over";
  }

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

function TshirtExportCameraView({ view }) {
  const { camera, controls } = useThree();

  useFrame(() => {
    if (!view) return;

    // Pendant l'export, on force une caméra propre et stable de face.
    // La vue face/dos/manches est obtenue en tournant le modèle lui-même.
    camera.position.set(0, 0.35, 3.2);
    camera.lookAt(0, 0.15, 0);
    camera.updateProjectionMatrix();

    if (controls) {
      controls.target.set(0, 0.15, 0);
      controls.update();
    }
  });

  return null;
}

function TshirtModel({ texture, view }) {
  const { scene } = useGLTF(MODEL_URL);
  const normalMap = useLoader(THREE.TextureLoader, NORMAL_URL);
  const roughnessMap = useLoader(THREE.TextureLoader, ROUGHNESS_URL);

  normalMap.flipY = false;
  roughnessMap.flipY = false;
  normalMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.colorSpace = THREE.NoColorSpace;

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = new THREE.MeshStandardMaterial({
        map: texture,
        normalMap,
        roughnessMap,
        roughness: 0.86,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    });
    return clone;
  }, [scene, texture, normalMap, roughnessMap]);

  const rotationY = view ? (TSHIRT_EXPORT_VIEWS[view]?.rotationY || 0) : 0;

  return (
    <group rotation={[0, rotationY, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default function Vue3DTshirt() {
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
  const [exportView, setExportView] = useState(null);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const actionRef = useRef(null);

  const baseImage = useImage(BASE_COLOR_URL);
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

  const printTexture = useMemo(
    () => makeUvTexture(baseImage, itemImages, items, tshirtColor),
    [baseImage, itemImages, items, tshirtColor]
  );

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.src?.startsWith("blob:")) URL.revokeObjectURL(item.src);
      }
    };
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

  function handleLogoUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const newItems = files.map((file, index) =>
      limitItemToPrintArea({
        id: uid(),
        type: "image",
        area: activeArea,
        technique: defaultTechnique,
        x: clamp(0.5 + index * 0.04, 0.05, 0.95),
        y: clamp(0.38 + index * 0.04, 0.05, 0.95),
        width: Math.min(0.22, getMaxItemWidthScale(activeArea, printZoneSizes)),
        height: 0.16,
        rotation: 0,
        src: URL.createObjectURL(file),
        fileName: file.name,
        layerName: file.name,
        hidden: false,
        locked: false,
        z: Date.now() + index,
      }, printZoneSizes)
    );
    setItems((current) => [...current, ...newItems]);
    setSelectedId(newItems[0].id);
    event.target.value = "";
  }

  async function handleFontUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const fontName = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const src = URL.createObjectURL(file);
    try {
      const font = new FontFace(fontName, `url(${src})`);
      await font.load();
      document.fonts.add(font);
      setCustomFonts((current) => [...current, { name: fontName, src, file, originalName: file.name }]);
      if (selectedItem?.type === "text") updateItem(selectedItem.id, { fontFamily: fontName });
    } catch (error) {
      alert("Police impossible à charger. Essaie un fichier .ttf, .otf, .woff ou .woff2.");
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

  async function buildFontFiles() {
    return customFonts
      .filter((font) => font?.file)
      .map((font, index) => {
        const extension = getFontExtension(font.file);
        const filename = sanitizeFontFilename(font.originalName || font.file?.name || font.name, extension);
        return {
          name: `polices/${String(index + 1).padStart(2, "0")}-${filename}`,
          blob: font.file,
        };
      });
  }


  async function buildAutoMockupFiles() {
    const files = [];
    const canvas = previewRef.current?.querySelector("canvas");
    if (!canvas) return files;

    const views = ["front", "back", "leftSleeve", "rightSleeve"];

    for (const view of views) {
      const preset = TSHIRT_EXPORT_VIEWS[view];
      if (!preset) continue;

      setExportView(view);
      await waitForRender(360);
      files.push({ name: preset.filename, blob: await canvasToBlob(canvas) });
    }

    setExportView(null);
    await waitForRender(180);

    return files;
  }

  async function exportMockup() {
    try {
      const files = [];
      const canvas = previewRef.current?.querySelector("canvas");

      if (canvas) {
        files.push({ name: "mockup-tshirt.png", blob: await canvasToBlob(canvas) });
      }

      files.push(...(await buildAutoMockupFiles()));
      files.push(...(await buildPrintElementFiles()));
      files.push(...(await buildFontFiles()));

      if (!files.length) {
        alert("Aucun fichier à exporter.");
        return;
      }

      const zipBlob = await createZipBlob(files);
      downloadBlob(zipBlob, `export-tshirt-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      console.error("Erreur export ZIP :", error);
      alert("Export ZIP impossible. Vérifie la console pour plus de détails.");
    }
  }

  async function exportWorkshopPdf() {
    try {
      const printableItems = items
        .filter((item) => !item.hidden)
        .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

      if (!printableItems.length) {
        alert("Ajoute au moins un logo ou un texte visible avant de générer le PDF atelier.");
        return;
      }

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

      pdf.save(`fiche-atelier-tshirt-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Erreur export PDF atelier :", error);
      alert("Export PDF atelier impossible. Vérifie la console pour plus de détails.");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>👕 T-shirt 3D</h2>
          <p>Multi logos, textes, manches et polices personnalisées.</p>
        </div>
        <div className="tshirt3d-export-actions">
          <button className="primary" onClick={exportMockup}>Exporter ZIP impression</button>
          <button type="button" onClick={exportWorkshopPdf}>Exporter PDF atelier</button>
        </div>
      </div>

      <div className="tshirt3d-layout">
        <div className="card tshirt3d-preview-card">
          <div className="tshirt3d-preview" ref={previewRef}>
            <Canvas shadows camera={{ position: [0, 0.35, 3.2], fov: 42 }} gl={{ preserveDrawingBuffer: true }}>
              <TshirtExportCameraView view={exportView} />
              <ambientLight intensity={0.9} />
              <directionalLight position={[2, 3, 4]} intensity={1.8} castShadow />
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.15}>
                  <Center>
                    <TshirtModel texture={printTexture} view={exportView} />
                  </Center>
                </Bounds>
                <Environment preset="studio" />
              </Suspense>
              <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
            </Canvas>
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
                    <text
                      x="500"
                      y="120"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={item.textColor || "#111827"}
                      fontFamily={item.fontFamily || "Arial"}
                      fontWeight="900"
                      fontSize="165"
                      textLength="900"
                      lengthAdjust="spacingAndGlyphs"
                    >
                      {item.text || "Texte"}
                    </text>
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
