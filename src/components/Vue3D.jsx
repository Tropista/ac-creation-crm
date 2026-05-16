import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import "./Vue3D.css";

const MODEL_URL = `${import.meta.env.BASE_URL}models/scene.gltf`;
const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 600;

// Zone pointillée de droite = vraie zone imprimable envoyée sur le mug.
// Les images sont bloquées dans cette zone, et le rendu 3D utilise cette même zone.
const SAFE_ZONE = {
  left: 0.065,
  top: 0.055,
  right: 0.935,
  bottom: 0.945,
};

const SAFE_ZONE_WIDTH = SAFE_ZONE.right - SAFE_ZONE.left;
const SAFE_ZONE_HEIGHT = SAFE_ZONE.bottom - SAFE_ZONE.top;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function getItemDrawSize(item) {
  const width = CANVAS_WIDTH * Math.max(0.03, Number(item.widthScale || 0.22));
  const height = CANVAS_HEIGHT * Math.max(0.03, Number(item.heightScale || 0.22));
  return { width, height };
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
      const fontFamily = item.fontFamily || "Arial";
      ctx.fillStyle = item.color || "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.max(20, drawHeight * 0.75)}px ${fontFamily}`;
      ctx.fillText(item.text || "Texte", 0, 0, drawWidth);
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
                <div
                  className="vue3d-text-item"
                  style={{
                    color: item.color || "#ffffff",
                    fontFamily: item.fontFamily || "Arial",
                    fontSize: "100%",
                    fontWeight: 700,
                  }}
                >
                  {item.text || "Texte"}
                </div>
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
  const selectedItem = items.find((item) => item.id === selectedId);

  function handleImagesUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((file) => file.type.startsWith("image/"));

    if (!validFiles.length) {
      alert("Choisis une ou plusieurs images valides : PNG, JPG ou WEBP.");
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
      .catch(() => alert("Impossible de lire une des images."));

    event.target.value = "";
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
      </div>

      <div className="vue3d-zakeke-layout">
        <div className="card vue3d-preview-card">
          <h3>Aperçu 3D</h3>
          <div className="vue3d-viewer">
            <Canvas camera={{ position: [0, 0.25, 4.2], fov: 28 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
              <ambientLight intensity={1.4} />
              <directionalLight position={[4, 6, 5]} intensity={2.4} />
              <directionalLight position={[-4, 2, -3]} intensity={0.8} />

              <Suspense fallback={null}>
                <MugModel items={items} />
                <Environment preset="city" />
              </Suspense>

              <OrbitControls makeDefault enableDamping dampingFactor={0.08} enablePan={false} minDistance={0.6} maxDistance={6} />
            </Canvas>
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
                    <option value="Arial">Arial</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Trebuchet MS">Trebuchet MS</option>
                    <option value="Impact">Impact</option>
                    <option value="Comic Sans MS">Comic Sans MS</option>
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
