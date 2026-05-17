import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
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
  front: { width: 30, height: 40 },
  back: { width: 30, height: 40 },
  leftSleeve: { width: 12, height: 12 },
  rightSleeve: { width: 12, height: 12 },
};

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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cmToPixels(cm) {
  return Math.max(1, Math.round(Number(cm || 0) * CM_TO_INCH * EXPORT_DPI));
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

function getItemPrintSizeCm(item) {
  const areaSize = PRINT_ZONE_SIZES_CM[item.area] || PRINT_ZONE_SIZES_CM.front;
  return {
    width: Math.max(0.1, Number(item.width || 0.22) * areaSize.width),
    height: Math.max(0.1, Number(item.height || 0.16) * areaSize.height),
  };
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

  for (const item of items) {
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

function TshirtModel({ texture }) {
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

  return <primitive object={clonedScene} />;
}

export default function Vue3DTshirt() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeArea, setActiveArea] = useState("front");
  const [tshirtColor, setTshirtColor] = useState("#ffffff");
  const [showPrintZone, setShowPrintZone] = useState(true);
  const [customFonts, setCustomFonts] = useState([]);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const actionRef = useRef(null);

  const baseImage = useImage(BASE_COLOR_URL);
  const itemImages = useItemImages(items);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const visibleItems = items.filter((item) => item.area === activeArea);

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
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addText() {
    const item = { id: uid(), ...DEFAULT_TEXT_ITEM, area: activeArea };
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
  }

  function handleLogoUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const newItems = files.map((file, index) => ({
      id: uid(),
      type: "image",
      area: activeArea,
      x: clamp(0.5 + index * 0.04, 0.05, 0.95),
      y: clamp(0.38 + index * 0.04, 0.05, 0.95),
      width: 0.22,
      height: 0.16,
      rotation: 0,
      src: URL.createObjectURL(file),
      fileName: file.name,
    }));
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
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98),
      y: clamp((event.clientY - rect.top) / rect.height, 0.02, 0.98),
      rect,
    };
  }

  function startMove(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item) return;
    actionRef.current = {
      type: "move",
      id: itemId,
      startPointer: point,
      startItem: { ...item },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startResize(event, itemId, axis = "both") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item) return;
    actionRef.current = {
      type: "resize",
      axis,
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
      updateItem(action.id, {
        x: clamp(action.startItem.x + dx, 0.02, 0.98),
        y: clamp(action.startItem.y + dy, 0.02, 0.98),
      });
    }

    if (action.type === "resize") {
      const dx = point.x - action.startPointer.x;
      const dy = point.y - action.startPointer.y;
      const patch = {};

      if (action.axis === "x" || action.axis === "both") {
        patch.width = clamp(Number(action.startItem.width || 0.22) + dx * 1.6, 0.035, 1.2);
      }

      if (action.axis === "y" || action.axis === "both") {
        patch.height = clamp(Number(action.startItem.height || 0.16) + dy * 1.6, 0.025, 1.2);
      }

      updateItem(action.id, patch);
    }
  }

  function stopPointer() {
    actionRef.current = null;
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
    const copy = { ...selectedItem, id: uid(), x: clamp(selectedItem.x + 0.05, 0.02, 0.98), y: clamp(selectedItem.y + 0.05, 0.02, 0.98) };
    setItems((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  async function buildPrintElementFiles() {
    const files = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const { width, height } = getItemPrintSizeCm(item);
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
      const filename = `impression/${String(index + 1).padStart(2, "0")}-${sanitizeFilename(areaLabel)}-${sanitizeFilename(baseName)}-${width.toFixed(1)}x${height.toFixed(1)}cm-300dpi.png`;

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

  async function exportMockup() {
    try {
      const files = [];
      const canvas = previewRef.current?.querySelector("canvas");

      if (canvas) {
        files.push({ name: "mockup-tshirt.png", blob: await canvasToBlob(canvas) });
      }

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

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>👕 T-shirt 3D</h2>
          <p>Multi logos, textes, manches et polices personnalisées.</p>
        </div>
        <button className="primary" onClick={exportMockup}>Exporter mockup + fichiers impression</button>
      </div>

      <div className="tshirt3d-layout">
        <div className="card tshirt3d-preview-card">
          <div className="tshirt3d-preview" ref={previewRef}>
            <Canvas shadows camera={{ position: [0, 0.35, 3.2], fov: 42 }} gl={{ preserveDrawingBuffer: true }}>
              <ambientLight intensity={0.9} />
              <directionalLight position={[2, 3, 4]} intensity={1.8} castShadow />
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.15}>
                  <Center>
                    <TshirtModel texture={printTexture} />
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
            <button className="danger" disabled={!selectedItem} onClick={deleteSelected}>Supprimer</button>
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
            {showPrintZone && <div className={`tshirt3d-zone-border area-${activeArea}`} />}
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className={`tshirt3d-design ${item.id === selectedId ? "selected" : ""}`}
                onPointerDown={(event) => startMove(event, item.id)}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.width * 100}%`,
                  height: `${(item.height || 0.16) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
                }}
              >
                {item.type === "image" ? (
                  <img src={item.src} alt={item.fileName || "Logo"} />
                ) : (
                  <span style={{ color: item.textColor, fontFamily: item.fontFamily }}>{item.text}</span>
                )}
                <button className="tshirt3d-resize-handle x" onPointerDown={(event) => startResize(event, item.id, "x")} title="Largeur" />
                <button className="tshirt3d-resize-handle y" onPointerDown={(event) => startResize(event, item.id, "y")} title="Hauteur" />
                <button className="tshirt3d-resize-handle both" onPointerDown={(event) => startResize(event, item.id, "both")} title="Largeur + hauteur" />
              </div>
            ))}
          </div>

          {selectedItem ? (
            <div className="tshirt3d-selected-panel">
              <strong>Élément sélectionné : {selectedItem.type === "image" ? selectedItem.fileName || "Logo" : "Texte"}</strong>
              {selectedItem.type === "text" && (
                <div className="tshirt3d-form-grid">
                  <label>Texte<input value={selectedItem.text || ""} onChange={(e) => updateItem(selectedItem.id, { text: e.target.value })} /></label>
                  <label>Couleur<input type="color" value={selectedItem.textColor || "#111827"} onChange={(e) => updateItem(selectedItem.id, { textColor: e.target.value })} /></label>
                  <label>Police
                    <select value={selectedItem.fontFamily || "Arial"} onChange={(e) => updateItem(selectedItem.id, { fontFamily: e.target.value })}>
                      <option value="Arial">Arial</option>
                      <option value="Impact">Impact</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Verdana">Verdana</option>
                      {customFonts.map((font) => <option key={font.name} value={font.name}>{font.name}</option>)}
                    </select>
                  </label>
                  <label>Taille texte<input type="range" min="24" max="160" step="1" value={selectedItem.textSize || 74} onChange={(e) => updateItem(selectedItem.id, { textSize: Number(e.target.value) })} /></label>
                </div>
              )}
              <div className="tshirt3d-controls">
                <label>Largeur<input type="range" min="0.035" max="1.2" step="0.005" value={selectedItem.width} onChange={(e) => updateItem(selectedItem.id, { width: Number(e.target.value) })} /></label>
                <label>Hauteur<input type="range" min="0.025" max="1.2" step="0.005" value={selectedItem.height || 0.16} onChange={(e) => updateItem(selectedItem.id, { height: Number(e.target.value) })} /></label>
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
