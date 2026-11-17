import { useMemo } from "react";
import * as THREE from "three";
import type { PymasModel } from "../../types/pymas";
import {
  distributedLoadMagnitude,
  framePositions,
  nodePosition,
  pointAtStation,
  projectLoadToGlobal,
  type Vec3,
} from "../../engine/geometry";
import {
  quaternionForAxis,
  quaternionFromUnitVectors,
  Y_AXIS,
} from "./threeUtils";

interface LoadVectorsProps {
  model: PymasModel;
  patternId: string | null;
  loadScale: number;
  diagonal: number;
}

interface ArrowSpec {
  key: string;
  origin: Vec3;
  direction: Vec3;
  length: number;
  color: string;
}

interface MomentSpec {
  key: string;
  origin: Vec3;
  axis: Vec3;
  radius: number;
}

const NODAL_COLOR = "#f87171";
const DISTRIBUTED_COLOR = "#fbbf24";
const MOMENT_COLOR = "#c084fc";
const STATIONS = [0.1, 0.5, 0.9];

function unit(v: Vec3): Vec3 | null {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(n) || n < 1e-12) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function Arrow({
  origin,
  direction,
  length,
  color,
  diagonal,
}: {
  origin: Vec3;
  direction: Vec3;
  length: number;
  color: string;
  diagonal: number;
}) {
  const quaternion = useMemo(
    () => quaternionFromUnitVectors(Y_AXIS, new THREE.Vector3(...direction)),
    [direction],
  );
  const thickness = Math.min(
    diagonal * 0.0045,
    Math.max(length * 0.11, diagonal * 0.0016),
  );
  const headLength = Math.min(length * 0.38, thickness * 7);
  const shaftLength = Math.max(length - headLength, length * 0.2);

  return (
    <group position={origin} quaternion={quaternion} renderOrder={5}>
      <mesh position={[0, shaftLength / 2, 0]}>
        <cylinderGeometry args={[thickness, thickness, shaftLength, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.22}
          roughness={0.5}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, shaftLength + headLength / 2, 0]}>
        <coneGeometry args={[thickness * 2.6, headLength, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.22}
          roughness={0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function LoadVectors({
  model,
  patternId,
  loadScale,
  diagonal,
}: LoadVectorsProps) {
  const data = useMemo(() => {
    const pattern = patternId ? model.loadPatterns[patternId] : undefined;
    if (!pattern) {
      return {
        arrows: [] as ArrowSpec[],
        moments: [] as MomentSpec[],
      };
    }

    const nodal: Array<{ origin: Vec3; force: Vec3; moment: Vec3 }> = [];
    const distributed: Array<{ origin: Vec3; force: Vec3 }> = [];

    for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
      const node = model.nodes[nodeId];
      if (!node) continue;
      nodal.push({
        origin: nodePosition(node),
        force: [load.fx, load.fy, load.fz],
        moment: [load.mx, load.my, load.mz],
      });
    }

    for (const [frameId, loads] of Object.entries(pattern.frameLoads)) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const { p1, p2 } = framePositions(frame, model.nodes);
      for (const load of loads) {
        const force = projectLoadToGlobal(load, frame.localAxes);
        const magnitude = distributedLoadMagnitude(load);
        if (magnitude < 1e-12) continue;
        for (const station of STATIONS) {
          distributed.push({
            origin: pointAtStation(p1, p2, station),
            force,
          });
        }
      }
    }

    const nodalMax = nodal.reduce(
      (max, entry) => Math.max(max, Math.hypot(...entry.force)),
      0,
    );
    const distributedMax = distributed.reduce(
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
          color: NODAL_COLOR,
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

    distributed.forEach((entry, index) => {
      const magnitude = Math.hypot(...entry.force);
      const direction = unit(entry.force);
      if (!direction || magnitude < 1e-12) return;
      arrows.push({
        key: `distributed-${index}`,
        origin: entry.origin,
        direction,
        length: Math.max(
          (magnitude / Math.max(distributedMax, 1e-12)) * targetLength,
          diagonal * 0.008,
        ),
        color: DISTRIBUTED_COLOR,
      });
    });

    return { arrows, moments };
  }, [model, patternId, loadScale, diagonal]);

  if (data.arrows.length === 0 && data.moments.length === 0) return null;

  return (
    <group>
      {data.arrows.map((arrow) => (
        <Arrow
          key={arrow.key}
          origin={arrow.origin}
          direction={arrow.direction}
          length={arrow.length}
          color={arrow.color}
          diagonal={diagonal}
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
            args={[moment.radius, moment.radius * 0.22, 8, 28]}
          />
          <meshStandardMaterial
            color={MOMENT_COLOR}
            emissive={MOMENT_COLOR}
            emissiveIntensity={0.35}
            roughness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
}
