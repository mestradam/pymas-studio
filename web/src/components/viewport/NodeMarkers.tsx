import { Html } from "@react-three/drei";
import type { PymasModel, SupportKind } from "../../types/pymas";
import { nodePosition } from "../../engine/geometry";
import { useThemeStore } from "../../store/useThemeStore";

interface NodeMarkersProps {
  model: PymasModel;
  showNodes: boolean;
  showSupports: boolean;
  showLabels: boolean;
  diagonal: number;
}

const SUPPORT_COLORS: Record<SupportKind, string> = {
  fixed: "#f97316",
  pinned: "#fb923c",
  roller: "#fbbf24",
  rotational: "#a78bfa",
  free: "#64748b",
};

const SUPPORT_COLORS_LIGHT: Record<SupportKind, string> = {
  fixed: "#c2410c",
  pinned: "#b45309",
  roller: "#a16207",
  rotational: "#6d28d9",
  free: "#475569",
};

function SupportGlyph({
  kind,
  size,
  light,
}: {
  kind: SupportKind;
  size: number;
  light: boolean;
}) {
  const color = (light ? SUPPORT_COLORS_LIGHT : SUPPORT_COLORS)[kind];
  const material = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={0.16}
      roughness={0.4}
      metalness={0.25}
    />
  );

  switch (kind) {
    case "fixed":
      return (
        <mesh position={[0, 0, -size * 0.15]}>
          <boxGeometry args={[size * 1.5, size * 1.5, size * 0.75]} />
          {material}
        </mesh>
      );
    case "pinned":
      return (
        <mesh position={[0, 0, -size * 0.8]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[size * 0.9, size * 1.6, 4]} />
          {material}
        </mesh>
      );
    case "roller":
      return (
        <mesh position={[0, 0, -size * 0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size * 0.75, size * 0.75, size * 0.8, 18]} />
          {material}
        </mesh>
      );
    case "rotational":
      return (
        <mesh position={[0, 0, -size * 0.35]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 0.75, size * 0.18, 10, 24]} />
          {material}
        </mesh>
      );
    default:
      return null;
  }
}

export default function NodeMarkers({
  model,
  showNodes,
  showSupports,
  showLabels,
  diagonal,
}: NodeMarkersProps) {
  const theme = useThemeStore((state) => state.theme);
  const light = theme === "light";
  const nodeRadius = Math.max(diagonal * 0.0045, 1e-4);
  const supportSize = Math.max(diagonal * 0.018, nodeRadius * 2.6);
  const labelScale = Math.max(diagonal * 1.6, 1);
  const nodes = model.nodeOrder.map((id) => model.nodes[id]).filter((n) => n !== undefined);
  const supports = Object.values(model.supports).filter(
    (support) => support.kind !== "free" && model.nodes[support.node],
  );

  return (
    <group>
      {showNodes &&
        nodes.map((node) => (
          <mesh key={`node-${node.id}`} position={nodePosition(node)}>
            <sphereGeometry args={[nodeRadius, 14, 10]} />
            <meshStandardMaterial
              color={light ? "#475569" : "#e2e8f0"}
              emissive={light ? "#64748b" : "#94a3b8"}
              emissiveIntensity={0.25}
              roughness={0.35}
              metalness={0.3}
            />
          </mesh>
        ))}

      {showSupports &&
        supports.map((support) => {
          const node = model.nodes[support.node];
          if (!node) return null;
          return (
            <group key={`support-${support.id}`} position={nodePosition(node)}>
              <SupportGlyph
                kind={support.kind}
                size={supportSize}
                light={light}
              />
            </group>
          );
        })}

      {showLabels &&
        nodes.map((node) => (
          <Html
            key={`label-${node.id}`}
            position={[node.x, node.y, node.z]}
            center
            distanceFactor={labelScale}
            zIndexRange={[20, 0]}
            className="pointer-events-none select-none"
          >
            <span className="whitespace-nowrap rounded border border-white/10 bg-slate-950/85 px-1 py-0.5 font-mono text-[9px] leading-none text-sky-200 shadow">
              {node.name || node.id}
            </span>
          </Html>
        ))}
    </group>
  );
}
