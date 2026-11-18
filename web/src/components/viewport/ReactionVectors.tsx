import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import { formatNumber, nodePosition, type Vec3 } from "../../engine/geometry";
import {
  quaternionForAxis,
  quaternionFromUnitVectors,
  Y_AXIS,
} from "./threeUtils";

interface ReactionVectorsProps {
  model: PymasModel;
  result: PatternResultData;
  diagonal: number;
}

interface ReactionArrow {
  key: string;
  origin: Vec3;
  direction: Vec3;
  length: number;
  magnitude: number;
  label: Vec3;
  showLabel: boolean;
}

interface ReactionMoment {
  key: string;
  origin: Vec3;
  axis: Vec3;
  radius: number;
}

const FORCE_COLOR = "#34d399";
const MOMENT_COLOR = "#c4b5fd";

function unit(v: Vec3): Vec3 | null {
  const norm = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(norm) || norm < 1e-12) return null;
  return [v[0] / norm, v[1] / norm, v[2] / norm];
}

function Arrow({
  origin,
  direction,
  length,
  diagonal,
}: {
  origin: Vec3;
  direction: Vec3;
  length: number;
  diagonal: number;
}) {
  const quaternion = useMemo(
    () => quaternionFromUnitVectors(Y_AXIS, new THREE.Vector3(...direction)),
    [direction],
  );
  const thickness = Math.min(
    diagonal * 0.004,
    Math.max(length * 0.1, diagonal * 0.0014),
  );
  const headLength = Math.min(length * 0.36, thickness * 7);
  const shaftLength = Math.max(length - headLength, length * 0.2);

  return (
    <group position={origin} quaternion={quaternion} renderOrder={8}>
      <mesh position={[0, shaftLength / 2, 0]}>
        <cylinderGeometry args={[thickness, thickness, shaftLength, 8]} />
        <meshStandardMaterial
          color={FORCE_COLOR}
          emissive={FORCE_COLOR}
          emissiveIntensity={0.38}
          roughness={0.45}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, shaftLength + headLength / 2, 0]}>
        <coneGeometry args={[thickness * 2.6, headLength, 10]} />
        <meshStandardMaterial
          color={FORCE_COLOR}
          emissive={FORCE_COLOR}
          emissiveIntensity={0.38}
          roughness={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Vectores de reacción en los apoyos del caso activo. La longitud es
 * proporcional a la magnitud respecto a la reacción máxima; los momentos de
 * empotramiento se dibujan como arcos.
 */
export default function ReactionVectors({
  model,
  result,
  diagonal,
}: ReactionVectorsProps) {
  const data = useMemo(() => {
    const entries: Array<{
      key: string;
      origin: Vec3;
      force: Vec3;
      moment: Vec3;
      magnitude: number;
      momentMagnitude: number;
    }> = [];

    for (const [nodeId, reaction] of Object.entries(result.reactions)) {
      const node = model.nodes[nodeId];
      if (!node) continue;
      const force: Vec3 = [reaction.fx, reaction.fy, reaction.fz];
      const moment: Vec3 = [reaction.mx, reaction.my, reaction.mz];
      const magnitude = Math.hypot(...force);
      const momentMagnitude = Math.hypot(...moment);
      if (magnitude < 1e-9 && momentMagnitude < 1e-9) continue;
      entries.push({
        key: nodeId,
        origin: nodePosition(node),
        force,
        moment,
        magnitude,
        momentMagnitude,
      });
    }

    const maxForce = entries.reduce(
      (max, entry) => Math.max(max, entry.magnitude),
      0,
    );
    const maxMoment = entries.reduce(
      (max, entry) => Math.max(max, entry.momentMagnitude),
      0,
    );
    const targetLength = diagonal * 0.12;
    const arrows: ReactionArrow[] = [];
    const moments: ReactionMoment[] = [];

    for (const entry of entries) {
      const direction = unit(entry.force);
      if (direction && entry.magnitude > 1e-9) {
        const length = Math.max(
          (entry.magnitude / Math.max(maxForce, 1e-12)) * targetLength,
          diagonal * 0.012,
        );
        arrows.push({
          key: entry.key,
          origin: entry.origin,
          direction,
          length,
          magnitude: entry.magnitude,
          label: [
            entry.origin[0] + direction[0] * length * 1.06,
            entry.origin[1] + direction[1] * length * 1.06,
            entry.origin[2] + direction[2] * length * 1.06,
          ],
          showLabel: false,
        });
      }

      const axis = unit(entry.moment);
      if (
        axis &&
        maxMoment > 1e-9 &&
        entry.momentMagnitude >= maxMoment * 0.02
      ) {
        const relative =
          entry.momentMagnitude / Math.max(maxMoment, 1e-12);
        moments.push({
          key: entry.key,
          origin: entry.origin,
          axis,
          radius: diagonal * (0.005 + 0.02 * Math.sqrt(relative)),
        });
      }
    }

    // Sólo las tres reacciones mayores llevan etiqueta para no saturar la escena.
    const labeled = new Set(
      [...arrows]
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, 3)
        .map((arrow) => arrow.key),
    );
    for (const arrow of arrows) arrow.showLabel = labeled.has(arrow.key);

    return { arrows, moments };
  }, [model, result, diagonal]);

  if (data.arrows.length === 0 && data.moments.length === 0) return null;

  const forceUnit = model.meta.units.force;

  return (
    <group>
      {data.arrows.map((arrow) => (
        <group key={arrow.key}>
          <Arrow
            origin={arrow.origin}
            direction={arrow.direction}
            length={arrow.length}
            diagonal={diagonal}
          />
          {arrow.showLabel && (
            <Html
              position={arrow.label}
              center
              zIndexRange={[14, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className="whitespace-nowrap rounded border border-emerald-400/40 bg-slate-950/85 px-1 py-0.5 font-mono text-[9px] leading-none text-emerald-200 shadow-md">
                R {formatNumber(arrow.magnitude)} {forceUnit}
              </div>
            </Html>
          )}
        </group>
      ))}
      {data.moments.map((moment) => (
        <mesh
          key={`moment-${moment.key}`}
          position={moment.origin}
          quaternion={quaternionForAxis(moment.axis)}
          renderOrder={8}
        >
          <torusGeometry args={[moment.radius, moment.radius * 0.2, 8, 26]} />
          <meshStandardMaterial
            color={MOMENT_COLOR}
            emissive={MOMENT_COLOR}
            emissiveIntensity={0.4}
            roughness={0.45}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
