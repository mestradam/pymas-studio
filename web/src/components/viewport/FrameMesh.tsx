import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ColorMode } from "../../engine/colors";
import { frameColor } from "../../engine/colors";
import {
  framePositions,
  sectionDisplayDimensions,
  type Vec3,
} from "../../engine/geometry";
import type { PymasModel } from "../../types/pymas";
import type { RenderMode } from "../../store/useModelStore";
import { quaternionForLocalAxes } from "./threeUtils";

interface FrameMeshProps {
  model: PymasModel;
  renderMode: RenderMode;
  colorMode: ColorMode;
  opacity: number;
  sectionScale: number;
  diagonal: number;
  /** Sustituye el color por barra (por ejemplo, mapa de calor A/B). */
  colorForFrame?: (frameId: string) => string | null;
}

interface ExtrudedFrame {
  position: Vec3;
  quaternion: THREE.Quaternion;
  scale: Vec3;
  color: string;
}

export default function FrameMesh({
  model,
  renderMode,
  colorMode,
  opacity,
  sectionScale,
  diagonal,
  colorForFrame,
}: FrameMeshProps) {
  const wire = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const { p1, p2 } = framePositions(frame, model.nodes);
      const color = new THREE.Color(
        colorForFrame?.(frameId) ?? frameColor(frame, model, colorMode),
      );
      positions.push(...p1, ...p2);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  }, [model, colorMode, colorForFrame]);

  const extruded = useMemo<ExtrudedFrame[]>(() => {
    const entries: ExtrudedFrame[] = [];
    const minDimension = Math.max(diagonal * 0.0018, 1e-6);
    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const section = model.sections[frame.sectionId];
      const dims = sectionDisplayDimensions(
        section ?? {
          id: "",
          name: "",
          type: "Section",
          dy: minDimension,
          dz: minDimension,
          A: 0,
          Iy: 0,
          Iz: 0,
          J: 0,
          explicitDimensions: false,
          isRectangular: false,
        },
      );
      const { p1, p2 } = framePositions(frame, model.nodes);
      const midpoint: Vec3 = [
        (p1[0] + p2[0]) / 2,
        (p1[1] + p2[1]) / 2,
        (p1[2] + p2[2]) / 2,
      ];
      const length = Math.max(frame.length, 1e-6);
      entries.push({
        position: midpoint,
        quaternion: quaternionForLocalAxes(frame.localAxes),
        scale: [
          length,
          Math.max(dims.dy * sectionScale, minDimension),
          Math.max(dims.dz * sectionScale, minDimension),
        ],
        color: colorForFrame?.(frameId) ?? frameColor(frame, model, colorMode),
      });
    }
    return entries;
  }, [model, colorMode, sectionScale, diagonal, colorForFrame]);

  if (renderMode === "wire") {
    return (
      <lineSegments renderOrder={2}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[wire.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[wire.colors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent={opacity < 0.99}
          opacity={opacity}
          depthWrite={false}
        />
      </lineSegments>
    );
  }

  if (extruded.length === 0) return null;

  return (
    <ExtrudedFrames
      entries={extruded}
      opacity={opacity}
    />
  );
}

function ExtrudedFrames({
  entries,
  opacity,
}: {
  entries: ExtrudedFrame[];
  opacity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    entries.forEach((entry, index) => {
      position.set(...entry.position);
      quaternion.copy(entry.quaternion);
      scale.set(...entry.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(entry.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [entries]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(entries.length, 1)]}
      frustumCulled
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        roughness={0.55}
        metalness={0.18}
        transparent={opacity < 0.99}
        opacity={opacity}
        depthWrite={opacity > 0.7}
      />
    </instancedMesh>
  );
}
