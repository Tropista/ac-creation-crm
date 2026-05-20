import { useEffect, useState } from "react";
import * as THREE from "three";

export default function MugDesignPatch({
  imageUrl,
  size = 1,
  posX = 0,
  posY = 0
}) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!imageUrl) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    let active = true;

    loader.load(
      imageUrl,
      (loadedTexture) => {
        if (!active) return;

        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.anisotropy = 16;
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
        loadedTexture.needsUpdate = true;

        setTexture(loadedTexture);
      },
      undefined,
      () => {
        if (active) setTexture(null);
      }
    );

    return () => {
      active = false;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!texture) return;

    const safeSize = Math.max(
      0.35,
      Math.min(2.8, Number(size || 1))
    );

    const repeatX = 0.52 / safeSize;
    const repeatY = 1 / safeSize;

    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(
      0.24 + Number(posX || 0) * 0.22,
      0.5 - repeatY / 2 + Number(posY || 0) * 0.12
    );

    texture.needsUpdate = true;
  }, [texture, size, posX, posY]);

  if (!texture) return null;

  return (
    <mesh
      renderOrder={20}
      rotation={[0, Math.PI / 2, 0]}
      position={[0, Number(posY || 0) * 0.08, 0]}
    >
      <cylinderGeometry
        args={[
          1.005,
          1.005,
          2.05,
          96,
          1,
          true,
          -Math.PI * 0.28,
          Math.PI * 0.56,
        ]}
      />

      <meshStandardMaterial
        map={texture}
        transparent
        side={THREE.FrontSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
      />
    </mesh>
  );
}