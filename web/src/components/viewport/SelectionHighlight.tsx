import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useModelStore } from "../../store/useModelStore";
import { useThemeStore } from "../../store/useThemeStore";
import type { PymasModel } from "../../types/pymas";
import { framePositions, nodePosition, type Vec3 } from "../../engine/geometry";
import { quaternionFromUnitVectors, Y_AXIS } from "./threeUtils";

interface SelectionHighlightProps {
  model: PymasModel;
  diagonal: number;
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/** Resalta la barra o el nudo seleccionado, en ambos modos de render. */
export default function SelectionHighlight({
  model,
  diagonal,
}: SelectionHighlightProps) {
  const selectedFrameId = useModelStore((state) => state.selectedFrameId);
  const selectedNodeId = useModelStore((state) => state.selectedNodeId);
  const theme = useThemeStore((state) => state.theme);
  const light = theme === "light";

  const frame = selectedFrameId ? model.frames[selectedFrameId] : undefined;
  const node = selectedNodeId ? model.nodes[selectedNodeId] : undefined;

  const frameGeometry = useMemo(() => {
    if (!frame) return null;
    const { p1, p2 } = framePositions(frame, model.nodes);
    const start = new THREE.Vector3(...p1);
    const end = new THREE.Vector3(...p2);
    const direction = end.clone().sub(start);
    const length = Math.max(direction.length(), 1e-6);
    const quaternion = quaternionFromUnitVectors(
      Y_AXIS,
      direction.normalize(),
    );
    return {
      p1,
      p2,
      center: midpoint(p1, p2),
      quaternion,
      length,
    };
  }, [frame, model.nodes]);

  const frameRadius = Math.max(diagonal * 0.007, 1e-5);
  const nodeRadius = Math.max(diagonal * 0.014, 1e-5);
  const labelScale = Math.max(diagonal * 1.6, 1);

  return (
    <group>
      {frame && frameGeometry && (
        <group>
          <mesh
            position={frameGeometry.center}
            quaternion={frameGeometry.quaternion}
            renderOrder={30}
          >
            <cylinderGeometry
              args={[frameRadius, frameRadius, frameGeometry.length, 16, 1, true]}
            />
            <meshBasicMaterial
              color={light ? "#0e7490" : "#22d3ee"}
              transparent
              opacity={0.55}
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          {[frameGeometry.p1, frameGeometry.p2].map((point, index) => (
            <mesh
              key={`selected-frame-end-${index}`}
              position={point}
              renderOrder={31}
            >
              <sphereGeometry args={[frameRadius * 1.9, 16, 12]} />
              <meshBasicMaterial
                color={light ? "#0891b2" : "#67e8f9"}
                transparent
                opacity={0.85}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          ))}
          <Html
            position={frameGeometry.center}
            center
            distanceFactor={labelScale}
            zIndexRange={[40, 0]}
            className="pointer-events-none select-none"
          >
            <span className="whitespace-nowrap rounded border border-cyan-300/50 bg-slate-950/90 px-1.5 py-0.5 font-mono text-[9px] leading-none text-cyan-200 shadow-lg">
              {frame.name || frame.id}
            </span>
          </Html>
        </group>
      )}

      {node && (
        <group position={nodePosition(node)}>
          <mesh renderOrder={30}>
            <sphereGeometry args={[nodeRadius, 20, 14]} />
            <meshBasicMaterial
              color={light ? "#b45309" : "#f59e0b"}
              transparent
              opacity={0.28}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh renderOrder={31}>
            <sphereGeometry args={[nodeRadius * 0.55, 18, 12]} />
            <meshBasicMaterial
              color={light ? "#b45309" : "#fbbf24"}
              transparent
              opacity={0.95}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <Html
            position={[0, 0, nodeRadius * 1.6]}
            center
            distanceFactor={labelScale}
            zIndexRange={[40, 0]}
            className="pointer-events-none select-none"
          >
            <span className="whitespace-nowrap rounded border border-amber-300/50 bg-slate-950/90 px-1.5 py-0.5 font-mono text-[9px] leading-none text-amber-200 shadow-lg">
              {node.name || node.id}
            </span>
          </Html>
        </group>
      )}
    </group>
  );
}
