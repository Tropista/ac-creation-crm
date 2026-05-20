import { Bounds, Center, useGLTF } from "@react-three/drei";

export default function Product3DModel({ modelUrl }) {
  const { scene } = useGLTF(modelUrl);

  return (
    <Bounds fit clip observe margin={1.2}>
      <Center>
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <primitive
            object={scene}
            scale={1.25}
            rotation={[0, 0, 0]}
          />
        </group>
      </Center>
    </Bounds>
  );
}