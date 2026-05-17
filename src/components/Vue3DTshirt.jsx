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
  full: { label: "Texture complète", x: 0, y: 0, w: 1, h: 1 },
};

const DEFAULT_TEXT_ITEM = {
  type: "text",
  area: "front",
  x: 0.5,
  y: 0.38,
  width: 0.28,
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
  const cx = zoneX + Number(item.x || 0.5) * zoneW;
  const cy = zoneY + Number(item.y || 0.5) * zoneH;
  const drawW = Math.max(30, Number(item.width || 0.25) * zoneW);

  ctx.save();
  ctx.beginPath();
  ctx.rect(zoneX, zoneY, zoneW, zoneH);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((Number(item.rotation || 0) * Math.PI) / 180);

  if (item.type === "image" && logoImage) {
    const ratio = logoImage.height / Math.max(1, logoImage.width);
    const drawH = drawW * ratio;
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
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
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
      setCustomFonts((current) => [...current, { name: fontName, src }]);
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

  function startResize(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item) return;
    actionRef.current = {
      type: "resize",
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
      updateItem(action.id, {
        width: clamp(action.startItem.width + dx * 1.6, 0.035, 1.2),
      });
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

  function exportMockup() {
    const canvas = previewRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "mockup-tshirt.png";
    a.click();
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>👕 T-shirt 3D</h2>
          <p>Multi logos, textes, manches et polices personnalisées.</p>
        </div>
        <button className="primary" onClick={exportMockup}>Exporter le mockup</button>
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
                  transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
                }}
              >
                {item.type === "image" ? (
                  <img src={item.src} alt={item.fileName || "Logo"} />
                ) : (
                  <span style={{ color: item.textColor, fontFamily: item.fontFamily }}>{item.text}</span>
                )}
                <button className="tshirt3d-resize-handle" onPointerDown={(event) => startResize(event, item.id)} title="Redimensionner" />
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
                <label>Taille<input type="range" min="0.035" max="1.2" step="0.005" value={selectedItem.width} onChange={(e) => updateItem(selectedItem.id, { width: Number(e.target.value) })} /></label>
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
