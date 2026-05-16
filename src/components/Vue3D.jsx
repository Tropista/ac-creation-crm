import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import "./Vue3D.css";

const MODEL_URL = `${import.meta.env.BASE_URL}models/scene.gltf`;

function MugModel() {
  const { scene } = useGLTF(MODEL_URL);

  useEffect(() => {
    if (!scene) return;

    scene.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      if (child.material) {
        child.material = child.material.clone();
        child.material.needsUpdate = true;
      }
    });
  }, [scene]);

  return (
    <Bounds fit clip observe margin={1.1}>
      <Center>
        <primitive object={scene} scale={1.3} />
      </Center>
    </Bounds>
  );
}

function PrintArea({ imageUrl, size, x, y, rotation, height }) {
  const texture = useMemo(() => {
    if (!imageUrl) return null;

    const loader = new THREE.TextureLoader();
    const tex = loader.load(imageUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 16;
    return tex;
  }, [imageUrl]);

  useEffect(() => {
    if (!texture) return;

    const safeSize = Math.max(0.45, Math.min(2.5, Number(size || 1)));
    const safeX = Number(x || 0);
    const safeY = Number(y || 0);

    texture.repeat.set(0.78 / safeSize, 0.9 / safeSize);
    texture.offset.set(0.11 + safeX * 0.22, 0.5 - (0.9 / safeSize) / 2 + safeY * 0.22);
    texture.needsUpdate = true;
  }, [texture, size, x, y]);

  if (!texture) return null;

/*
  Cette couche est une "zone imprimable" indépendante du modèle 3D.
  Elle couvre seulement l'extérieur du mug.
*/

return (
  <mesh
    position={[0, Number(y || 0) * 0.02, 0.01]}
    rotation={[0, Number(rotation || 0), 0]}
    renderOrder={1}
  >
    <cylinderGeometry
      args={[
        0.73,
        0.73,
        Number(height || 1.18),
        128,
        1,
        true,
        -Math.PI * 0.32,
        Math.PI * 0.64,
      ]}
    />

    <meshBasicMaterial
      map={texture}
      transparent={true}
      side={THREE.DoubleSide}
      depthWrite={false}
    />
  </mesh>
);}

export default function Vue3D() {
  const [imageUrl, setImageUrl] = useState("");
  const [size, setSize] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [height, setHeight] = useState(1.42);

  function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Choisis une image valide : PNG, JPG ou WEBP.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      setImageUrl(e.target.result);
    };

    reader.onerror = () => {
      alert("Impossible de lire l'image.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function resetImage() {
    setImageUrl("");
    setSize(1);
    setX(0);
    setY(0);
    setRotation(0);
    setHeight(1.42);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Vue 3D</h2>
          <p>Test local du mug personnalisable avec image client.</p>
        </div>
      </div>

      <div className="vue3d-grid">
        <div className="card vue3d-viewer-card">
          <div className="vue3d-viewer">
            <Canvas
              camera={{ position: [0, 0.25, 4.2], fov: 28 }}
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
            >
              <ambientLight intensity={1.4} />
              <directionalLight position={[4, 6, 5]} intensity={2.4} />
              <directionalLight position={[-4, 2, -3]} intensity={0.8} />

              <Suspense fallback={null}>
                <MugModel />
                <PrintArea
                  imageUrl={imageUrl}
                  size={size}
                  x={x}
                  y={y}
                  rotation={rotation}
                  height={height}
                />
                <Environment preset="city" />
              </Suspense>

              <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.08}
                enablePan={false}
                minDistance={0.6}
                maxDistance={6}
              />
            </Canvas>

            <div className="vue3d-hint">↔ tourner le mug · molette pour zoomer</div>
          </div>
        </div>

        <div className="card vue3d-controls">
          <h3>Personnalisation</h3>

          <label>
            Image à appliquer sur le mug
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} />
          </label>

          {imageUrl && (
            <div className="vue3d-preview">
              <strong>Aperçu image importée</strong>
              <img src={imageUrl} alt="Aperçu du visuel importé" />
            </div>
          )}

          <label>
            Taille du visuel
            <input
              type="range"
              min="0.45"
              max="2.5"
              step="0.05"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          </label>

          <label>
            Position horizontale
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={x}
              onChange={(e) => setX(e.target.value)}
            />
          </label>

          <label>
            Position verticale
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={y}
              onChange={(e) => setY(e.target.value)}
            />
          </label>

          <label>
            Rotation zone imprimable
            <input
              type="range"
              min="-3.14"
              max="3.14"
              step="0.01"
              value={rotation}
              onChange={(e) => setRotation(e.target.value)}
            />
          </label>

          <label>
            Hauteur zone imprimable
            <input
              type="range"
              min="0.8"
              max="1.8"
              step="0.01"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>

          <button type="button" onClick={resetImage}>
            Réinitialiser
          </button>

          <p className="muted">
            Prototype : l'image est placée uniquement sur une bande extérieure du mug, sans toucher la poignée, l'intérieur ni le dessous.
          </p>
        </div>
      </div>
    </section>
  );
}

useGLTF.preload(MODEL_URL);
