import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import "./Vue3D.css";
import Product3DErrorBoundary from "./3d/Product3DErrorBoundary";
import { MUG_MODEL_URL } from "../utils/assets";
import { showToast } from "../utils/toast";

const MODEL_URL = MUG_MODEL_URL;
const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 600;

// Zone imprimable complète du mug : 210 × 90 mm.
// Les éléments peuvent maintenant occuper 100% du gabarit et l'export correspond à 21 × 9 cm.
const SAFE_ZONE = {
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
};

const SAFE_ZONE_WIDTH = SAFE_ZONE.right - SAFE_ZONE.left;
const SAFE_ZONE_HEIGHT = SAFE_ZONE.bottom - SAFE_ZONE.top;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const EXPORT_DPI = 300;
const CM_TO_INCH = 1 / 2.54;
const MUG_PRINT_SIZE_CM = { width: 21, height: 9 };

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

function getMugItemPrintSizeCm(item) {
  return {
    width: Math.max(0.1, Number(item.widthScale || 0.22) * MUG_PRINT_SIZE_CM.width),
    height: Math.max(0.1, Number(item.heightScale || 0.22) * MUG_PRINT_SIZE_CM.height),
  };
}

function drawMugPrintItemForExport(ctx, item, widthPx, heightPx) {
  ctx.clearRect(0, 0, widthPx, heightPx);
  ctx.save();
  ctx.translate(widthPx / 2, heightPx / 2);
  ctx.rotate(Number(item.rotation || 0));

  if (item.type === "text") {
    const text = String(item.text || "Texte");
    ctx.fillStyle = item.color || "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let fontSize = Math.floor(heightPx * 0.72);
    ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;

    while (ctx.measureText(text).width > widthPx * 0.92 && fontSize > 8) {
      fontSize -= 2;
      ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
    }

    ctx.fillText(text, 0, 0, widthPx * 0.92);
  } else if (item.image) {
    ctx.drawImage(item.image, -widthPx / 2, -heightPx / 2, widthPx, heightPx);
  }

  ctx.restore();
}

function isPrintAreaMesh(child) {
  const name = String(child?.name || "").toLowerCase();
  const parentName = String(child?.parent?.name || "").toLowerCase();

  return (
    name.includes("print_area") ||
    name.includes("printarea") ||
    name.includes("print") ||
    parentName.includes("print_area") ||
    parentName.includes("printarea") ||
    parentName.includes("print")
  );
}

function createPrintTexture(items) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const sortedItems = [...items].sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

  for (const item of sortedItems) {
    if (!item.image && item.type !== "text") continue;

    // Les coordonnées de l'éditeur sont relatives à toute la zone visible.
    // Ici on les convertit pour que la zone pointillée corresponde à 100% du mug.
    const safeX = (Number(item.x || 0.5) - SAFE_ZONE.left) / SAFE_ZONE_WIDTH;
    const safeY = (Number(item.y || 0.5) - SAFE_ZONE.top) / SAFE_ZONE_HEIGHT;
    const safeWidth = Math.max(0.03, Number(item.widthScale || 0.22)) / SAFE_ZONE_WIDTH;
    const safeHeight = Math.max(0.03, Number(item.heightScale || 0.22)) / SAFE_ZONE_HEIGHT;

    const drawWidth = CANVAS_WIDTH * safeWidth;
    const drawHeight = CANVAS_HEIGHT * safeHeight;
    const centerX = safeX * CANVAS_WIDTH;
    const centerY = safeY * CANVAS_HEIGHT;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(Number(item.rotation || 0));

    if (item.type === "text") {
      const text = item.text || "Texte";
      const fontFamily = item.fontFamily || "Arial";

      // On dessine le texte dans un canvas temporaire, puis on l'étire dans la zone.
      // Cela garantit que le rendu 2D et le rendu 3D suivent exactement les points bleus.
      const textCanvas = document.createElement("canvas");
      textCanvas.width = 1200;
      textCanvas.height = 400;

      const textCtx = textCanvas.getContext("2d");
      textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
      textCtx.fillStyle = item.color || "#ffffff";
      textCtx.textAlign = "center";
      textCtx.textBaseline = "middle";
      textCtx.font = `700 260px ${fontFamily}`;

      textCtx.fillText(text, textCanvas.width / 2, textCanvas.height / 2, textCanvas.width * 0.94);

      ctx.drawImage(
        textCanvas,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    } else {
      // Découpe 2 px pour éviter les traits noirs éventuels sur les bords de l'image.
      ctx.drawImage(
        item.image,
        2,
        2,
        Math.max(1, item.image.width - 4),
        Math.max(1, item.image.height - 4),
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    }

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

function MugModel({ items }) {
  const { scene } = useGLTF(MODEL_URL);

  const printTexture = useMemo(() => {
    if (!items.length) return null;
    return createPrintTexture(items);
  }, [items]);

  useEffect(() => {
    if (!scene) return;

    scene.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      if (!child.userData.originalMaterial && child.material) {
        child.userData.originalMaterial = child.material.clone();
      }

      const isPrintArea = isPrintAreaMesh(child);

      if (!isPrintArea) {
        child.visible = true;
        if (child.userData.originalMaterial) {
          child.material = child.userData.originalMaterial.clone();
          child.material.needsUpdate = true;
        }
        return;
      }

      if (!printTexture) {
        child.visible = false;
        return;
      }

      child.visible = true;
      child.material = new THREE.MeshBasicMaterial({
        map: printTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -6,
      });
      child.material.needsUpdate = true;
      child.renderOrder = 20;
    });
  }, [scene, printTexture]);

  return (
    <Bounds fit clip observe margin={1.1}>
      <Center>
        <primitive object={scene} scale={1.3} />
      </Center>
    </Bounds>
  );
}

function DesignEditor({ items, setItems, selectedId, setSelectedId }) {
  const editorRef = useRef(null);
  const actionRef = useRef(null);

  const selectedItem = items.find((item) => item.id === selectedId);

  function updateItem(id, patch) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function getPointerPosition(event) {
    const rect = editorRef.current.getBoundingClientRect();
    return {
      px: event.clientX - rect.left,
      py: event.clientY - rect.top,
      nx: (event.clientX - rect.left) / rect.width,
      ny: (event.clientY - rect.top) / rect.height,
      rect,
    };
  }

  function limitItemToSafeZone(item) {
    let widthScale = clamp(Number(item.widthScale || 0.22), 0.03, SAFE_ZONE_WIDTH);
    let heightScale = clamp(Number(item.heightScale || 0.22), 0.03, SAFE_ZONE_HEIGHT);

    const minX = SAFE_ZONE.left + widthScale / 2;
    const maxX = SAFE_ZONE.right - widthScale / 2;
    const minY = SAFE_ZONE.top + heightScale / 2;
    const maxY = SAFE_ZONE.bottom - heightScale / 2;

    return {
      ...item,
      widthScale,
      heightScale,
      x: clamp(Number(item.x || 0.5), minX, maxX),
      y: clamp(Number(item.y || 0.5), minY, maxY),
    };
  }

  function startDrag(event, item) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);

    const pos = getPointerPosition(event);
    actionRef.current = {
      type: "move",
      id: item.id,
      startPx: pos.px,
      startPy: pos.py,
      startX: item.x,
      startY: item.y,
      rect: pos.rect,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startResize(event, item, mode = "corner-br") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);

    const pos = getPointerPosition(event);

    actionRef.current = {
      type: "resize",
      mode,
      id: item.id,
      startPx: pos.px,
      startPy: pos.py,
      startX: Number(item.x || 0.5),
      startY: Number(item.y || 0.5),
      startWidth: Number(item.widthScale || 0.22),
      startHeight: Number(item.heightScale || 0.22),
      rect: pos.rect,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startRotate(event, item) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);

    const pos = getPointerPosition(event);
    const centerPx = item.x * pos.rect.width;
    const centerPy = item.y * pos.rect.height;
    const startAngle = Math.atan2(pos.py - centerPy, pos.px - centerPx);

    actionRef.current = {
      type: "rotate",
      id: item.id,
      startRotation: item.rotation || 0,
      startAngle,
      centerPx,
      centerPy,
      rect: pos.rect,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function resizeWithMode(action, pos) {
    const dx = (pos.px - action.startPx) / action.rect.width;
    const dy = (pos.py - action.startPy) / action.rect.height;

    let nextX = action.startX;
    let nextY = action.startY;
    let nextWidth = action.startWidth;
    let nextHeight = action.startHeight;

    const minSize = 0.03;
    const maxWidth = SAFE_ZONE_WIDTH;
    const maxHeight = SAFE_ZONE_HEIGHT;
    const mode = action.mode;

    if (mode.includes("r")) {
      const rawWidth = action.startWidth + dx;
      nextWidth = clamp(rawWidth, minSize, maxWidth);
      nextX = action.startX + (nextWidth - action.startWidth) / 2;
    }

    if (mode.includes("l")) {
      const rawWidth = action.startWidth - dx;
      nextWidth = clamp(rawWidth, minSize, maxWidth);
      nextX = action.startX - (nextWidth - action.startWidth) / 2;
    }

    if (mode.includes("b")) {
      const rawHeight = action.startHeight + dy;
      nextHeight = clamp(rawHeight, minSize, maxHeight);
      nextY = action.startY + (nextHeight - action.startHeight) / 2;
    }

    if (mode.includes("t")) {
      const rawHeight = action.startHeight - dy;
      nextHeight = clamp(rawHeight, minSize, maxHeight);
      nextY = action.startY - (nextHeight - action.startHeight) / 2;
    }

    return limitItemToSafeZone({
      x: nextX,
      y: nextY,
      widthScale: nextWidth,
      heightScale: nextHeight,
    });
  }

  function handlePointerMove(event) {
    const action = actionRef.current;
    if (!action) return;

    event.preventDefault();
    const pos = getPointerPosition(event);

    if (action.type === "move") {
      const dx = (pos.px - action.startPx) / action.rect.width;
      const dy = (pos.py - action.startPy) / action.rect.height;
      const current = items.find((item) => item.id === action.id);
      if (!current) return;

      updateItem(
        action.id,
        limitItemToSafeZone({
          ...current,
          x: action.startX + dx,
          y: action.startY + dy,
        })
      );
    }

    if (action.type === "resize") {
      updateItem(action.id, resizeWithMode(action, pos));
    }

    if (action.type === "rotate") {
      const currentAngle = Math.atan2(pos.py - action.centerPy, pos.px - action.centerPx);
      updateItem(action.id, {
        rotation: action.startRotation + currentAngle - action.startAngle,
      });
    }
  }

  function stopAction(event) {
    if (!actionRef.current) return;
    actionRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function bringForward() {
    if (!selectedItem) return;
    const maxZ = Math.max(0, ...items.map((item) => Number(item.z || 0)));
    updateItem(selectedItem.id, { z: maxZ + 1 });
  }

  function sendBackward() {
    if (!selectedItem) return;
    const minZ = Math.min(0, ...items.map((item) => Number(item.z || 0)));
    updateItem(selectedItem.id, { z: minZ - 1 });
  }

  return (
    <div className="vue3d-editor-block">
      <div className="vue3d-editor-topline">
        <strong>Gabarit 210 × 90 mm</strong>
        <span>Déplace, étire et tourne les images ici.</span>
      </div>

      <div
        ref={editorRef}
        className="vue3d-design-editor"
        onPointerMove={handlePointerMove}
        onPointerUp={stopAction}
        onPointerCancel={stopAction}
        onPointerDown={() => setSelectedId("")}
      >
        <div className="vue3d-safe-zone" />

        {items.map((item) => {
          const isSelected = item.id === selectedId;
          const widthPercent = clamp(Number(item.widthScale || 0.22) * 100, 3, 300);
          const heightPercent = clamp(Number(item.heightScale || 0.22) * 100, 3, 300);

          return (
            <div
              key={item.id}
              className={isSelected ? "vue3d-design-item selected" : "vue3d-design-item"}
              style={{
                left: `${Number(item.x || 0.5) * 100}%`,
                top: `${Number(item.y || 0.5) * 100}%`,
                width: `${widthPercent}%`,
                height: `${heightPercent}%`,
                transform: `translate(-50%, -50%) rotate(${Number(item.rotation || 0)}rad)`,
                zIndex: Number(item.z || 0) + 10,
              }}
              onPointerDown={(event) => startDrag(event, item)}
            >
              {item.type === "text" ? (
                <svg
                  className="vue3d-text-svg"
                  viewBox="0 0 1000 260"
                  preserveAspectRatio="none"
                  aria-label={item.text || "Texte"}
                >
                  <text
                    x="500"
                    y="135"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={item.color || "#ffffff"}
                    fontFamily={item.fontFamily || "Arial"}
                    fontWeight="700"
                    fontSize="190"
                  >
                    {item.text || "Texte"}
                  </text>
                </svg>
              ) : (
                <img src={item.src} alt={item.name} draggable="false" />
              )}

              {isSelected && (
                <>
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-corner vue3d-handle-tl"
                    title="Redimensionner haut gauche"
                    onPointerDown={(event) => startResize(event, item, "corner-tl")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-corner vue3d-handle-tr"
                    title="Redimensionner haut droite"
                    onPointerDown={(event) => startResize(event, item, "corner-tr")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-corner vue3d-handle-bl"
                    title="Redimensionner bas gauche"
                    onPointerDown={(event) => startResize(event, item, "corner-bl")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-corner vue3d-handle-br"
                    title="Redimensionner bas droite"
                    onPointerDown={(event) => startResize(event, item, "corner-br")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-top"
                    title="Étirer vers le haut"
                    onPointerDown={(event) => startResize(event, item, "t")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-bottom"
                    title="Étirer vers le bas"
                    onPointerDown={(event) => startResize(event, item, "b")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-left"
                    title="Étirer vers la gauche"
                    onPointerDown={(event) => startResize(event, item, "l")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-right"
                    title="Étirer vers la droite"
                    onPointerDown={(event) => startResize(event, item, "r")}
                  />
                  <button
                    type="button"
                    className="vue3d-handle vue3d-handle-rotate"
                    title="Tourner"
                    onPointerDown={(event) => startRotate(event, item)}
                  >
                    ↻
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="vue3d-editor-actions">
        <button type="button" onClick={bringForward} disabled={!selectedItem}>
          Mettre devant
        </button>
        <button type="button" onClick={sendBackward} disabled={!selectedItem}>
          Mettre derrière
        </button>
      </div>
    </div>
  );
}

export default function Vue3D() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [customFonts, setCustomFonts] = useState([]);
  const previewRef = useRef(null);

  const builtInFonts = [
    "Arial",
    "Arial Black",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Georgia",
    "Times New Roman",
    "Garamond",
    "Palatino Linotype",
    "Courier New",
    "Lucida Console",
    "Impact",
    "Comic Sans MS",
    "Brush Script MT",
    "Lucida Handwriting",
    "Segoe Script",
    "Segoe Print",
    "Franklin Gothic Medium",
    "Century Gothic",
    "Candara",
    "Calibri",
  ];

  const fontOptions = [...builtInFonts, ...customFonts.map((font) => font.family)];
  const selectedItem = items.find((item) => item.id === selectedId);

  function handleImagesUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((file) => file.type.startsWith("image/"));

    if (!validFiles.length) {
      showToast("Choisis une ou plusieurs images valides : PNG, JPG ou WEBP.", "error");
      event.target.value = "";
      return;
    }

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
              const image = new Image();
              image.onload = () =>
                resolve({
                  id: uid(),
                  name: file.name,
                  src: reader.result,
                  image,
                  x: 0.5,
                  y: 0.5,
                  widthScale: 0.25,
                  heightScale: 0.35,
                  rotation: 0,
                  z: Date.now(),
                });
              image.onerror = reject;
              image.src = reader.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    )
      .then((newItems) => {
        setItems((prev) => {
          const next = [...prev, ...newItems];
          setSelectedId(newItems[newItems.length - 1]?.id || next[0]?.id || "");
          return next;
        });
      })
      .catch(() => showToast("Impossible de lire une des images.", "error"));

    event.target.value = "";
  }

  async function handleFontsUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((file) =>
      /\.(ttf|otf|woff|woff2)$/i.test(file.name)
    );

    if (!validFiles.length) {
      showToast("Choisis une police valide : TTF, OTF, WOFF ou WOFF2.", "error");
      event.target.value = "";
      return;
    }

    for (const file of validFiles) {
      const cleanName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, "");
      const family = `Custom_${cleanName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const buffer = await file.arrayBuffer();

      try {
        const fontFace = new FontFace(family, buffer);
        await fontFace.load();
        document.fonts.add(fontFace);

        setCustomFonts((prev) => {
          if (prev.some((font) => font.family === family)) return prev;
          return [...prev, { family, label: cleanName, file, originalName: file.name }];
        });
      } catch (_error) {
        showToast(`Impossible de charger la police : ${file.name}`, "error");
      }
    }

    event.target.value = "";
  }


  async function buildMugPrintElementFiles() {
    const files = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const { width, height } = getMugItemPrintSizeCm(item);
      const widthPx = cmToPixels(width);
      const heightPx = cmToPixels(height);
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      drawMugPrintItemForExport(ctx, item, widthPx, heightPx);

      const baseName = item.type === "text" ? item.text || "texte" : item.name || "image";
      const filename = `impression/${String(index + 1).padStart(2, "0")}-${sanitizeFilename(baseName)}-${width.toFixed(1)}x${height.toFixed(1)}cm-300dpi.png`;

      files.push({ name: filename, blob: await canvasToBlob(canvas) });
    }

    return files;
  }

  async function buildMugFontFiles() {
    return customFonts
      .filter((font) => font?.file)
      .map((font, index) => {
        const extension = getFontExtension(font.file);
        const filename = sanitizeFontFilename(font.originalName || font.file?.name || font.label || font.family, extension);
        return {
          name: `polices/${String(index + 1).padStart(2, "0")}-${filename}`,
          blob: font.file,
        };
      });
  }

  async function exportMockupZip() {
    try {
      const files = [];
      const canvas = previewRef.current?.querySelector("canvas");

      if (canvas) {
        files.push({ name: "mockup-mug.png", blob: await canvasToBlob(canvas) });
      }

      files.push(...(await buildMugPrintElementFiles()));
      files.push(...(await buildMugFontFiles()));

      if (!files.length) {
        showToast("Aucun fichier à exporter.", "error");
        return;
      }

      const zipBlob = await createZipBlob(files);
      downloadBlob(zipBlob, `export-mug-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      console.error("Erreur export ZIP mug :", error);
      showToast("Export ZIP impossible. Vérifie la console pour plus de détails.", "error");
    }
  }

  function deleteSelectedItem() {
    if (!selectedId) return;
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== selectedId);
      setSelectedId(next[next.length - 1]?.id || "");
      return next;
    });
  }

  function resetItems() {
    setItems([]);
    setSelectedId("");
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Vue 3D</h2>
          <p>Éditeur type Zakeke : compose ton visuel sur le gabarit 210 × 90 mm et vois le rendu sur le mug.</p>
        </div>
        <button className="primary" type="button" onClick={exportMockupZip}>
          Exporter mockup + fichiers impression
        </button>
      </div>

      <div className="vue3d-zakeke-layout">
        <div className="card vue3d-preview-card">
          <h3>Aperçu 3D</h3>
          <div className="vue3d-viewer" ref={previewRef}>
            <Product3DErrorBoundary
              resetKey={MODEL_URL}
              title="Aperçu 3D indisponible"
              message="Impossible de charger le modèle du mug. Rechargez la page (Ctrl+F5) ou relancez l'application après un rebuild."
            >
              <Canvas camera={{ position: [0, 0.25, 4.2], fov: 28 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
                <ambientLight intensity={1.4} />
                <directionalLight position={[4, 6, 5]} intensity={2.4} />
                <directionalLight position={[-4, 2, -3]} intensity={0.8} />

                <Suspense fallback={null}>
                  <MugModel items={items} />
                </Suspense>

                <OrbitControls makeDefault enableDamping dampingFactor={0.08} enablePan={false} minDistance={0.6} maxDistance={6} />
              </Canvas>
            </Product3DErrorBoundary>
            <div className="vue3d-hint">↔ tourne le mug · molette pour zoomer le mug</div>
          </div>
        </div>

        <div className="card vue3d-editor-card">
          <div className="vue3d-toolbar">
            <label className="vue3d-upload-button">
              + Ajouter image
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleImagesUpload} />
            </label>

            <button
              type="button"
              onClick={() => {
                const id = uid();
                const newText = {
                  id,
                  type: "text",
                  text: "Mon texte",
                  color: "#ffffff",
                  fontFamily: "Arial",
                  x: 0.5,
                  y: 0.5,
                  widthScale: 0.25,
                  heightScale: 0.12,
                  rotation: 0,
                  z: Date.now(),
                };

                setItems((prev) => [...prev, newText]);
                setSelectedId(id);
              }}
            >
              + Ajouter texte
            </button>

            <label className="vue3d-font-button">
              + Importer police
              <input type="file" accept=".ttf,.otf,.woff,.woff2" multiple onChange={handleFontsUpload} />
            </label>

            <button type="button" onClick={deleteSelectedItem} disabled={!selectedId}>
              Supprimer
            </button>

            <button type="button" onClick={resetItems} disabled={!items.length}>
              Réinitialiser
            </button>
          </div>

          <DesignEditor items={items} setItems={setItems} selectedId={selectedId} setSelectedId={setSelectedId} />

          {selectedItem && (
            <div className="vue3d-selected-info">
              <strong>{selectedItem.type === "text" ? "Texte sélectionné" : "Image sélectionnée"}</strong>

              {selectedItem.type === "text" && (
                <p className="muted">
Tu peux importer tes propres polices avec le bouton “+ Importer police” : TTF, OTF, WOFF ou WOFF2.
                </p>
              )}

              {selectedItem.type === "text" ? (
                <>
                  <input
                    type="text"
                    value={selectedItem.text || ""}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((item) =>
                          item.id === selectedItem.id
                            ? { ...item, text: event.target.value }
                            : item
                        )
                      )
                    }
                    placeholder="Votre texte"
                  />

                  <input
                    type="color"
                    value={selectedItem.color || "#ffffff"}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((item) =>
                          item.id === selectedItem.id
                            ? { ...item, color: event.target.value }
                            : item
                        )
                      )
                    }
                  />

                  <select
                    value={selectedItem.fontFamily || "Arial"}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((item) =>
                          item.id === selectedItem.id
                            ? { ...item, fontFamily: event.target.value }
                            : item
                        )
                      )
                    }
                  >
                    {fontOptions.map((font) => {
                      const custom = customFonts.find((item) => item.family === font);
                      return (
                        <option key={font} value={font}>
                          {custom?.label || font}
                        </option>
                      );
                    })}
                  </select>
                </>
              ) : (
                <p>{selectedItem.name}</p>
              )}

              <p className="muted">
                Déplace avec la souris · poignées pour redimensionner · poignée ↻ pour tourner.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

useGLTF.preload(MODEL_URL);
