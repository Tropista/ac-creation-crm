import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import Product3DModel from "./Product3DModel";
import Product3DErrorBoundary from "./Product3DErrorBoundary";
import MugDesignPatch from "./MugDesignPatch";

export default function Product3DViewer({
  modelUrl,
  designImage,
  designSize = 1,
  designX = 0,
  designY = 0,
  fallbackLetter = "P"
}) {

  if (!modelUrl) {
    return (
      <div className="product-3d-placeholder">
        <span>{fallbackLetter}</span>
      </div>
    );
  }

  return (
    <Product3DErrorBoundary resetKey={modelUrl}>
      <div className="product-3d-viewer">
        <Canvas
          camera={{ position: [0, 0.12, 4.2], fov: 26 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={1.4} />
          <directionalLight position={[4, 6, 5]} intensity={2.4} />
          <directionalLight position={[-4, 2, -3]} intensity={0.8} />
          <Suspense fallback={null}>
            <Product3DModel modelUrl={modelUrl} />
            <MugDesignPatch
              imageUrl={designImage}
              size={Number(designSize || 1)}
              posX={Number(designX || 0)}
              posY={Number(designY || 0)}
            />
            <Environment preset="city" />
          </Suspense>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={0.35}
            maxDistance={5}
          />
        </Canvas>
        <div className="product-3d-hint">↔ tourner · molette zoom</div>
      </div>
    </Product3DErrorBoundary>
  );
}
