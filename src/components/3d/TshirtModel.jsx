import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { DoubleSide, MeshStandardMaterial } from "three";
import { PRODUCT_CONFIGS } from "../../utils/productConfigs";

export default function TshirtModel({ texture, garmentScale = [1, 1, 1], modelUrl, garmentColor = "#ffffff" }) {
  const { scene } = useGLTF(modelUrl || PRODUCT_CONFIGS.tshirt.modelUrl);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      child.material = new MeshStandardMaterial({
        map: texture,
        color: garmentColor,
        roughness: 0.72,
        metalness: 0,
        side: DoubleSide,
      });

      child.material.needsUpdate = true;
    });

    return clone;
  }, [scene, texture, garmentColor]);

  return <primitive object={clonedScene} scale={garmentScale} />;
}
