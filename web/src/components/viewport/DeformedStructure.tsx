import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import {
  autoDeformationScale,
  buildDeformation,
  deformationHeatRange,
} from "../../engine/deformation";
import { heatmapColor } from "../../engine/heatmap";
import { framePositions } from "../../engine/geometry";
import { useModelStore } from "../../store/useModelStore";

interface DeformedStructureProps {
  model: PymasModel;
  result: PatternResultData;
  diagonal: number;
}

const FALLBACK_COLOR: [number, number, number] = [0.25, 0.76, 0.98];

/**
 * Curva deformada de cada barra (Hermite sobre `internal_displacements`).
 *
 * La geometría se fusiona en un único `LineSegments` con colores por vértice
 * para dibujar cientos de barras sin crear un objeto por barra. La animación
 * armónica sólo reescribe el atributo de posición.
 */
export default function DeformedStructure({
  model,
  result,
  diagonal,
}: DeformedStructureProps) {
  const deformationScale = useModelStore((state) => state.deformationScale);
  const showGhost = useModelStore((state) => state.showGhost);
  const animate = useModelStore((state) => state.animateDeformation);
  const heatmapMode = useModelStore((state) => state.heatmapMode);
  const animateRef = useRef(animate);
  animateRef.current = animate;

  const data = useMemo(() => {
    const autoScale = autoDeformationScale(model, result, 0.08);
    const factor = autoScale * deformationScale;
    const deformation = buildDeformation(model, result, {
      scale: factor,
      subdivisions: 8,
    });
    const range =
      heatmapMode === "none"
        ? { min: 0, max: 0 }
        : deformationHeatRange(model, result, heatmapMode);
    return { deformation, factor, autoScale, range };
  }, [model, result, deformationScale, heatmapMode]);

  const scene = useMemo(() => {
    const base: number[] = [];
    const displacement: number[] = [];
    const colors: number[] = [];
    const hasRange = heatmapMode !== "none" && data.range.max - data.range.min > 1e-15;

    for (const curve of data.deformation.frames) {
      const points = curve.stations.length;
      for (let index = 0; index < points - 1; index += 1) {
        for (const vertex of [index, index + 1]) {
          const point = curve.undeformedPoints[vertex] ?? [0, 0, 0];
          const offset = curve.globalDisplacements[vertex] ?? [0, 0, 0];
          base.push(point[0], point[1], point[2]);
          displacement.push(offset[0], offset[1], offset[2]);

          let color = FALLBACK_COLOR;
          if (hasRange) {
            const value = curve.heat[heatmapMode][vertex] ?? 0;
            color = heatmapColor(value, data.range.min, data.range.max);
          }
          colors.push(color[0], color[1], color[2]);
        }
      }
    }

    const baseArray = new Float32Array(base);
    const displacementArray = new Float32Array(displacement);
    const positions = new Float32Array(baseArray.length);
    for (let index = 0; index < positions.length; index += 1) {
      positions[index] =
        (baseArray[index] ?? 0) + (displacementArray[index] ?? 0) * data.factor;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(colors), 3),
    );
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 6;
    lines.frustumCulled = false;

    return {
      lines,
      base: baseArray,
      displacement: displacementArray,
      geometry,
      material,
    };
  }, [data, heatmapMode]);

  const ghost = useMemo(() => {
    const positions: number[] = [];
    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const { p1, p2 } = framePositions(frame, model.nodes);
      positions.push(...p1, ...p2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
    );
    const material = new THREE.LineDashedMaterial({
      color: "#94a3b8",
      transparent: true,
      opacity: 0.34,
      dashSize: Math.max(diagonal * 0.016, 1e-5),
      gapSize: Math.max(diagonal * 0.011, 1e-5),
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.computeLineDistances();
    lines.renderOrder = 2;
    return { lines, geometry, material };
  }, [model, diagonal]);

  useEffect(
    () => () => {
      scene.geometry.dispose();
      scene.material.dispose();
    },
    [scene],
  );

  useEffect(
    () => () => {
      ghost.geometry.dispose();
      ghost.material.dispose();
    },
    [ghost],
  );

  useLayoutEffect(() => {
    if (animate) return;
    const attribute = scene.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < array.length; index += 1) {
      array[index] =
        (scene.base[index] ?? 0) + (scene.displacement[index] ?? 0) * data.factor;
    }
    attribute.needsUpdate = true;
  }, [scene, animate, data.factor]);

  useFrame(({ clock }) => {
    if (!animateRef.current) return;
    const amplitude =
      data.factor * (0.58 + 0.42 * Math.sin(clock.elapsedTime * 1.7));
    const attribute = scene.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < array.length; index += 1) {
      array[index] =
        (scene.base[index] ?? 0) +
        (scene.displacement[index] ?? 0) * amplitude;
    }
    attribute.needsUpdate = true;
  });

  return (
    <group>
      {showGhost && <primitive object={ghost.lines} />}
      <primitive object={scene.lines} />
    </group>
  );
}
