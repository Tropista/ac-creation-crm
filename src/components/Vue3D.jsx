import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import "./Vue3D.css";
import { useThree } from "@react-three/fiber";

const MODEL_URL = `${import.meta.env.BASE_URL}models/scene.gltf`;
const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 600;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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

function createPrintTexture(images) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (const item of images) {
    if (!item.image) continue;

    const scale = Math.max(0.05, Number(item.scale || 0.35));
    const imgRatio = item.image.width / item.image.height;

    const drawWidth = CANVAS_WIDTH * scale;
    const drawHeight = drawWidth / imgRatio;

    const centerX = Number(item.x || 0.5) * CANVAS_WIDTH;
    const centerY = (1 - Number(item.y || 0.5)) * CANVAS_HEIGHT;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(Number(item.rotation || 0));
    ctx.drawImage(item.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
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

function MugModel({
  images,
  selectedImageId,
  setImages,
  setSelectedImageId,
  dragRef,
  setIsEditingImage,
  }) {
  const { scene } = useGLTF(MODEL_URL);
  const { gl } = useThree();
  const printTexture = useMemo(() => {
    if (!images.length) return null;
    return createPrintTexture(images);
  }, [images]);

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
      child.userData.isPrintArea = isPrintArea;

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

  function pickImageAtUv(uv) {
    if (!uv || !images.length) return null;

    // On choisit l'image sélectionnée si elle existe, sinon la dernière importée.
    const selected = images.find((img) => img.id === selectedImageId);
    return selected || images[images.length - 1];
  }

  function handlePointerDown(event) {
    const object = event.object;
    if (!object?.userData?.isPrintArea || !event.uv) return;

    event.stopPropagation();
    gl.domElement.style.cursor = "grabbing";

    const targetImage = pickImageAtUv(event.uv);
    if (!targetImage) return;

    setSelectedImageId(targetImage.id);
    setIsEditingImage(true);

    dragRef.current = {
      imageId: targetImage.id,
      startUvX: event.uv.x,
      startUvY: event.uv.y,
      startX: targetImage.x,
      startY: targetImage.y,
    };

    event.target?.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || !event.uv) return;

    event.stopPropagation();

    const deltaX = event.uv.x - drag.startUvX;
    const deltaY = event.uv.y - drag.startUvY;

    setImages((prev) =>
      prev.map((img) =>
        img.id === drag.imageId
          ? {
              ...img,
              x: Math.min(1.5, Math.max(-0.5, drag.startX + deltaX)),
              y: Math.min(1.5, Math.max(-0.5, drag.startY + deltaY)),
            }
          : img
      )
    );
  }

  function handlePointerUp(event) {
    if (!dragRef.current) return;
    event.stopPropagation();
    gl.domElement.style.cursor = "grab";
    dragRef.current = null;
    setIsEditingImage(false);
    event.target?.releasePointerCapture?.(event.pointerId);
  }

 function handleWheel(event) {
  event.stopPropagation();
  event.sourceEvent.preventDefault();

  const object = event.object;

  if (!object?.userData?.isPrintArea || !images.length) return;

  const activeId = selectedImageId || images[images.length - 1]?.id;

  const delta = event.deltaY;
  const zoomSpeed = 0.0015;

  setImages((prev) =>
    prev.map((img) =>
      img.id === activeId
        ? {
            ...img,
            scale: Math.min(
              3,
              Math.max(
                0.05,
                Number(img.scale || 0.35) - delta * zoomSpeed
              )
            ),
          }
        : img
    )
  );
}

  return (
    <Bounds fit clip observe margin={1.1}>
      <Center>
        <primitive
          object={scene}
          scale={1.3}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        />
      </Center>
    </Bounds>
  );
}

export default function Vue3D() {
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [isEditingImage, setIsEditingImage] = useState(false);
  const dragRef = useRef(null);

  const selectedImage = images.find((image) => image.id === selectedImageId);

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
                  scale: 0.35,
                  rotation: 0,
                });
              image.onerror = reject;
              image.src = reader.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    )
      .then((newImages) => {
        setImages((prev) => {
          const next = [...prev, ...newImages];
          setSelectedImageId(newImages[newImages.length - 1]?.id || next[0]?.id || "");
          return next;
        });
      })
      .catch(() => alert("Impossible de lire une des images."));

    event.target.value = "";
  }

  function deleteSelectedImage() {
    if (!selectedImageId) return;

    setImages((prev) => {
      const next = prev.filter((img) => img.id !== selectedImageId);
      setSelectedImageId(next[next.length - 1]?.id || "");
      return next;
    });
  }

  function resetImages() {
    setImages([]);
    setSelectedImageId("");
    dragRef.current = null;
    setIsEditingImage(false);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Vue 3D</h2>
          <p>Importe plusieurs images, clique sur le mug pour déplacer, et utilise la molette pour agrandir/réduire.</p>
        </div>
      </div>

      <div className="vue3d-grid">
        <div className="card vue3d-viewer-card">
          <div className="vue3d-viewer">
            <Canvas
            onWheel={(e) => e.stopPropagation()}
              camera={{ position: [0, 0.25, 4.2], fov: 28 }}
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
            >
              <ambientLight intensity={1.4} />
              <directionalLight position={[4, 6, 5]} intensity={2.4} />
              <directionalLight position={[-4, 2, -3]} intensity={0.8} />

              <Suspense fallback={null}>
                <MugModel
                  images={images}
                  selectedImageId={selectedImageId}
                  setImages={setImages}
                  setSelectedImageId={setSelectedImageId}
                  dragRef={dragRef}
                  setIsEditingImage={setIsEditingImage}
                />
                <Environment preset="city" />
              </Suspense>

              <OrbitControls
                makeDefault
                enabled={!dragRef.current}
                enableZoom={!isEditingImage}
                rotateSpeed={0.8}
                enableDamping
                dampingFactor={0.08}
                enablePan={false}
                minDistance={0.6}
                maxDistance={6}
              />
            </Canvas>

            <div className="vue3d-hint">
              Clique/glisse sur l’image pour la déplacer · molette sur l’image pour agrandir/réduire · clique ailleurs pour tourner le mug
            </div>
          </div>
        </div>

        <div className="card vue3d-controls">
          <h3>Personnalisation</h3>

          <label>
            Images à appliquer sur le mug
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleImagesUpload} />
          </label>

          {images.length > 0 && (
            <div className="vue3d-image-list">
              <strong>Images importées</strong>

              {images.map((image, index) => (
                <button
                  type="button"
                  key={image.id}
                  className={image.id === selectedImageId ? "vue3d-image-item active" : "vue3d-image-item"}
                  onClick={() => setSelectedImageId(image.id)}
                >
                  <img src={image.src} alt={image.name} />
                  <span>
                    Image {index + 1}
                    <small>{image.name}</small>
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedImage && (
            <div className="vue3d-selected-info">
              <strong>Image sélectionnée</strong>
              <p>{selectedImage.name}</p>
              <p className="muted">
                Position : {selectedImage.x.toFixed(2)} / {selectedImage.y.toFixed(2)} · Taille :{" "}
                {selectedImage.scale.toFixed(2)}
              </p>
            </div>
          )}

          <button type="button" onClick={deleteSelectedImage} disabled={!selectedImageId}>
            Supprimer l’image sélectionnée
          </button>

          <button type="button" onClick={resetImages}>
            Réinitialiser toutes les images
          </button>

          <p className="muted">
            Les barres de réglage ont été retirées. Le placement se fait directement à la souris sur la zone imprimable.
          </p>
        </div>
      </div>
    </section>
  );
}

useGLTF.preload(MODEL_URL);
