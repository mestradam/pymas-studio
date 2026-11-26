import { useMemo } from "react";
import * as THREE from "three";
import type { PymasModel } from "../../types/pymas";
import type { LoadArrowMode } from "../../store/useModelStore";
import { useThemeStore } from "../../store/useThemeStore";
import { combinePatternLoads, type LoadFactors } from "../../engine/loads";
import {
  framePositions,
  nodePosition,
  pointAtStation,
  scale,
  sub,
  type Vec3,
} from "../../engine/geometry";
import {
  quaternionForAxis,
  quaternionFromUnitVectors,
  Y_AXIS,
} from "./threeUtils";

interface LoadVectorsProps {
  model: PymasModel;
  /** Factores por patrón: `{patrón: 1}` o los de una combinación; `null` oculta. */
  factors: LoadFactors | null;
  loadScale: number;
  diagonal: number;
  arrowMode: LoadArrowMode;
}

interface ArrowSpec {
  key: string;
  origin: Vec3;
  direction: Vec3;
  length: number;
  color: string;
}

interface EnvelopeSpec {
  key: string;
  points: Vec3[];
  color: string;
}

interface MomentSpec {
  key: string;
  origin: Vec3;
  axis: Vec3;
  radius: number;
}

const DARK_PALETTE = {
  nodal: "#f87171",
  distributed: "#fbbf24",
  moment: "#c084fc",
} as const;
const LIGHT_PALETTE = {
  nodal: "#dc2626",
  distributed: "#b45309",
  moment: "#7c3aed",
} as const;
/** Estaciones donde se dibujan las flechas de una carga distribuida. */
const STATIONS = [0.06, 0.28, 0.5, 0.72, 0.94];

function unit(v: Vec3): Vec3 | null {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(n) || n < 1e-12) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * Flecha técnica: astil muy fino y cono alargado. En modo `tip` la punta toca
 * el elemento cargado y el cuerpo queda por fuera; en modo `origin` la cola
 * nace en el elemento y la flecha apunta hacia afuera.
 */
function Arrow({
  origin,
  direction,
  length,
  color,
  diagonal,
  mode,
}: {
  origin: Vec3;
  direction: Vec3;
  length: number;
  color: string;
  diagonal: number;
  mode: LoadArrowMode;
}) {
  const quaternion = useMemo(
    () => quaternionFromUnitVectors(Y_AXIS, new THREE.Vector3(...direction)),
    [direction],
  );

  const radius = Math.max(
    Math.min(diagonal * 0.0013, length * 0.032),
    diagonal * 0.0005,
  );
  const headLength = Math.min(length * 0.3, radius * 9);
  const shaftLength = Math.max(length - headLength, length * 0.15);
  const headRadius = radius * 3.2;
  const start = useMemo(
    () =>
      mode === "tip"
        ? sub(origin, scale(direction, length))
        : ([...origin] as Vec3),
    [mode, origin, direction, length],
  );

  const material = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={0.24}
      roughness={0.5}
      metalness={0.1}
      toneMapped={false}
      depthWrite={false}
    />
  );

  return (
    <group position={start} quaternion={quaternion} renderOrder={5}>
      <mesh position={[0, shaftLength / 2, 0]}>
        <cylinderGeometry args={[radius, radius, shaftLength, 10]} />
        {material}
      </mesh>
      <mesh position={[0, shaftLength + headLength / 2, 0]}>
        <coneGeometry args={[headRadius, headLength, 12]} />
        {material}
      </mesh>
    </group>
  );
}

export default function LoadVectors({
  model,
  factors,
  loadScale,
  diagonal,
  arrowMode,
}: LoadVectorsProps) {
  const theme = useThemeStore((state) => state.theme);
  const palette = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;

  const data = useMemo(() => {
    const combined = factors ? combinePatternLoads(model, factors) : null;
    if (!combined) {
      return {
        arrows: [] as ArrowSpec[],
        moments: [] as MomentSpec[],
        envelopes: [] as EnvelopeSpec[],
      };
    }

    const nodal: Array<{ origin: Vec3; force: Vec3; moment: Vec3 }> = [];
    const distributedGroups: Array<{
      key: string;
      points: Vec3[];
      force: Vec3;
    }> = [];

    for (const [nodeId, load] of Object.entries(combined.nodal)) {
      const node = model.nodes[nodeId];
      if (!node) continue;
      nodal.push({
        origin: nodePosition(node),
        force: load.force,
        moment: load.moment,
      });
    }

    for (const [frameId, force] of Object.entries(combined.frames)) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      if (Math.hypot(...force) < 1e-12) continue;
      const { p1, p2 } = framePositions(frame, model.nodes);
      distributedGroups.push({
        key: `distributed-${frameId}`,
        points: STATIONS.map((station) => pointAtStation(p1, p2, station)),
        force,
      });
    }

    const nodalMax = nodal.reduce(
      (max, entry) => Math.max(max, Math.hypot(...entry.force)),
      0,
    );
    const distributedMax = distributedGroups.reduce(
      (max, entry) => Math.max(max, Math.hypot(...entry.force)),
      0,
    );
    const targetLength =
      Math.min(
        diagonal * 0.14,
        Math.max(
          (Object.values(model.frames).reduce(
            (sum, frame) => sum + frame.length,
            0,
          ) /
            Math.max(Object.keys(model.frames).length, 1)) *
            0.7,
          diagonal * 0.035,
        ),
      ) * loadScale;
    const arrows: ArrowSpec[] = [];
    const moments: MomentSpec[] = [];
    const envelopes: EnvelopeSpec[] = [];

    nodal.forEach((entry, index) => {
      const magnitude = Math.hypot(...entry.force);
      const direction = unit(entry.force);
      if (direction && magnitude >= 1e-12) {
        arrows.push({
          key: `nodal-${index}`,
          origin: entry.origin,
          direction,
          length: Math.max(
            (magnitude / Math.max(nodalMax, 1e-12)) * targetLength,
            diagonal * 0.008,
          ),
          color: palette.nodal,
        });
      }
      const momentMagnitude = Math.hypot(...entry.moment);
      const momentAxis = unit(entry.moment);
      if (momentAxis && momentMagnitude >= 1e-12) {
        moments.push({
          key: `moment-${index}`,
          origin: entry.origin,
          axis: momentAxis,
          radius: diagonal * 0.018,
        });
      }
    });

    distributedGroups.forEach((group) => {
      const magnitude = Math.hypot(...group.force);
      const direction = unit(group.force);
      if (!direction || magnitude < 1e-12) return;
      const length = Math.max(
        (magnitude / Math.max(distributedMax, 1e-12)) * targetLength,
        diagonal * 0.008,
      );

      group.points.forEach((point, index) => {
        arrows.push({
          key: `${group.key}-${index}`,
          origin: point,
          direction,
          length,
          color: palette.distributed,
        });
      });

      // Envolvente de carga: une los extremos posteriores (las colas) de las
      // flechas. Sólo tiene sentido cuando las puntas tocan el elemento.
      if (arrowMode === "tip") {
        envelopes.push({
          key: `${group.key}-envelope`,
          points: group.points.map((point) =>
            sub(point, scale(direction, length)),
          ),
          color: palette.distributed,
        });
      }
    });

    return { arrows, moments, envelopes };
  }, [model, factors, loadScale, diagonal, arrowMode, palette]);

  if (
    data.arrows.length === 0 &&
    data.moments.length === 0 &&
    data.envelopes.length === 0
  ) {
    return null;
  }

  return (
    <group>
      {data.envelopes.map((envelope) => {
        const coordinates: number[] = [];
        for (let index = 0; index < envelope.points.length - 1; index += 1) {
          const current = envelope.points[index];
          const next = envelope.points[index + 1];
          if (current && next) coordinates.push(...current, ...next);
        }
        const positions = new Float32Array(coordinates);
        return (
          <lineSegments key={envelope.key} renderOrder={4}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color={envelope.color}
              transparent
              opacity={0.72}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        );
      })}
      {data.arrows.map((arrow) => (
        <Arrow
          key={arrow.key}
          origin={arrow.origin}
          direction={arrow.direction}
          length={arrow.length}
          color={arrow.color}
          diagonal={diagonal}
          mode={arrowMode}
        />
      ))}
      {data.moments.map((moment) => (
        <mesh
          key={moment.key}
          position={moment.origin}
          quaternion={quaternionForAxis(moment.axis)}
          renderOrder={5}
        >
          <torusGeometry
            args={[moment.radius, moment.radius * 0.24, 8, 28]}
          />
          <meshStandardMaterial
            color={palette.moment}
            emissive={palette.moment}
            emissiveIntensity={0.35}
            roughness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
}
