import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import { frameColor } from "../../engine/colors";
import {
  autoDeformationScale,
  buildDeformation,
  deformationHeatRange,
} from "../../engine/deformation";
import {
  buildDeformedSolidFrame,
  frameSectionHalfExtents,
  interpolateScalarSeries,
} from "../../engine/deformedSolid";
import {
  heatmapColor,
  isDeformationScalar,
  isForceHeatScalar,
  type HeatmapScalar,
} from "../../engine/heatmap";
import { framePositions } from "../../engine/geometry";
import {
  frameForceHeatSeries,
  resultHeatRange,
} from "../../engine/resultHeatmap";
import { useModelStore } from "../../store/useModelStore";
import { useThemeStore } from "../../store/useThemeStore";
import FatLineSegments, {
  DEFORMED_LINE_PX,
  GHOST_LINE_PX,
  type FatLineSegmentsHandle,
} from "./FatLineSegments";

interface DeformedStructureProps {
  model: PymasModel;
  result: PatternResultData;
  diagonal: number;
}

const FALLBACK_COLOR: [number, number, number] = [0.25, 0.76, 0.98];
const FALLBACK_COLOR_LIGHT: [number, number, number] = [0.05, 0.42, 0.55];

function fillPositions(
  target: Float32Array,
  base: Float32Array,
  displacement: Float32Array,
  amplitude: number,
): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = (base[index] ?? 0) + (displacement[index] ?? 0) * amplitude;
  }
}

/**
 * Deformada de cada barra (Hermite sobre `internal_displacements`; en cerchas,
 * cuerda recta entre los nudos desplazados).
 *
 * Dos representaciones:
 *  - `line`: polilínea gruesa (`LineSegments2`) teñida con los escalares de
 *    la deformada;
 *  - `extruded`: cajas `dy × dz` que siguen la curva y giran con `θ`
 *    (`engine/deformedSolid`), teñidas con cualquier escalar del mapa de calor.
 *
 * En ambos casos toda la geometría se fusiona en pocos objetos y la animación
 * armónica sólo reescribe posiciones (`base + desplazamiento · amplitud`).
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
  const renderMode = useModelStore((state) => state.deformedRenderMode);
  const sectionScale = useModelStore((state) => state.sectionScale);
  const colorMode = useModelStore((state) => state.colorMode);
  const upAxis = useModelStore((state) => state.upAxis);
  const theme = useThemeStore((state) => state.theme);
  const light = theme === "light";
  const extruded = renderMode === "extruded";
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const lineRef = useRef<FatLineSegmentsHandle>(null);

  const data = useMemo(() => {
    const autoScale = autoDeformationScale(model, result, 0.08);
    const factor = autoScale * deformationScale;
    const deformation = buildDeformation(model, result, {
      scale: factor,
      subdivisions: 8,
      upAxis,
    });
    // La línea sólo se tiñe con magnitudes de la deformada (las acciones
    // internas se colorean en la malla sólida); el sólido deformado acepta
    // cualquier escalar.
    let scalar: HeatmapScalar | null = null;
    if (heatmapMode !== "none") {
      if (isDeformationScalar(heatmapMode) || extruded) scalar = heatmapMode;
    }
    const range =
      scalar === null
        ? { min: 0, max: 0 }
        : isDeformationScalar(scalar)
          ? deformationHeatRange(model, result, scalar, upAxis)
          : resultHeatRange(model, result, scalar, upAxis);
    const hasRange = scalar !== null && range.max - range.min > 1e-15;
    return { deformation, factor, range, scalar: hasRange ? scalar : null };
  }, [model, result, deformationScale, heatmapMode, upAxis, extruded]);

  /** Valores del escalar activo en las estaciones densificadas de cada curva. */
  const stationValues = useCallback(
    (curveIndex: number): number[] | null => {
      const curve = data.deformation.frames[curveIndex];
      if (!curve || !data.scalar) return null;
      if (isDeformationScalar(data.scalar)) return curve.heat[data.scalar];
      if (isForceHeatScalar(data.scalar)) {
        const frameResult = result.frameResults[curve.frameId];
        if (!frameResult) return null;
        const series = frameForceHeatSeries(frameResult, data.scalar);
        return interpolateScalarSeries(series.stations, series.values, curve.stations);
      }
      return null;
    },
    [data, result],
  );

  const line = useMemo(() => {
    if (extruded) return null;
    const base: number[] = [];
    const displacement: number[] = [];
    const colors: number[] = [];

    data.deformation.frames.forEach((curve, curveIndex) => {
      const values = stationValues(curveIndex);
      const points = curve.stations.length;
      for (let index = 0; index < points - 1; index += 1) {
        for (const vertex of [index, index + 1]) {
          const point = curve.undeformedPoints[vertex] ?? [0, 0, 0];
          const offset = curve.globalDisplacements[vertex] ?? [0, 0, 0];
          base.push(point[0], point[1], point[2]);
          displacement.push(offset[0], offset[1], offset[2]);

          let color = light ? FALLBACK_COLOR_LIGHT : FALLBACK_COLOR;
          if (values) {
            color = heatmapColor(values[vertex] ?? 0, data.range.min, data.range.max);
          }
          colors.push(color[0], color[1], color[2]);
        }
      }
    });

    const baseArray = new Float32Array(base);
    const displacementArray = new Float32Array(displacement);
    const positions = new Float32Array(baseArray.length);
    fillPositions(positions, baseArray, displacementArray, data.factor);
    return {
      positions,
      colors: new Float32Array(colors),
      base: baseArray,
      displacement: displacementArray,
      scratch: new Float32Array(baseArray.length),
    };
  }, [data, extruded, light, stationValues]);

  const solid = useMemo(() => {
    if (!extruded) return null;
    const base: number[] = [];
    const displacement: number[] = [];
    const colors: number[] = [];
    const edgeBase: number[] = [];
    const edgeDisplacement: number[] = [];
    const minDimension = Math.max(diagonal * 0.0018, 1e-6);

    data.deformation.frames.forEach((curve, curveIndex) => {
      const frame = model.frames[curve.frameId];
      if (!frame) return;
      const { halfY, halfZ } = frameSectionHalfExtents(
        model,
        frame,
        sectionScale,
        minDimension,
      );
      const box = buildDeformedSolidFrame(curve, frame, halfY, halfZ);
      const values = stationValues(curveIndex);
      const flat = new THREE.Color(frameColor(frame, model, colorMode));
      const stationColors = curve.stations.map((_, index) => {
        if (!values) return [flat.r, flat.g, flat.b] as const;
        const [r, g, b] = heatmapColor(
          values[index] ?? 0,
          data.range.min,
          data.range.max,
        );
        const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
        return [color.r, color.g, color.b] as const;
      });

      base.push(...box.base);
      displacement.push(...box.displacement);
      for (const station of box.stationIndex) {
        const color = stationColors[station] ?? [flat.r, flat.g, flat.b];
        colors.push(color[0], color[1], color[2]);
      }
      edgeBase.push(...box.edgeBase);
      edgeDisplacement.push(...box.edgeDisplacement);
    });

    const baseArray = new Float32Array(base);
    const displacementArray = new Float32Array(displacement);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(baseArray.length), 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(colors), 3),
    );

    const edgeBaseArray = new Float32Array(edgeBase);
    const edgeDisplacementArray = new Float32Array(edgeDisplacement);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(edgeBaseArray.length), 3),
    );

    return {
      geometry,
      base: baseArray,
      displacement: displacementArray,
      edgeGeometry,
      edgeBase: edgeBaseArray,
      edgeDisplacement: edgeDisplacementArray,
    };
  }, [data, extruded, model, sectionScale, colorMode, diagonal, stationValues]);

  useEffect(
    () => () => {
      solid?.geometry.dispose();
      solid?.edgeGeometry.dispose();
    },
    [solid],
  );

  const ghost = useMemo(() => {
    const positions: number[] = [];
    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const { p1, p2 } = framePositions(frame, model.nodes);
      positions.push(...p1, ...p2);
    }
    return new Float32Array(positions);
  }, [model]);

  /** Coloca la deformada con la amplitud dada (factor × fase de animación). */
  const applyAmplitude = useCallback(
    (amplitude: number, updateNormals: boolean) => {
      if (line) {
        fillPositions(line.scratch, line.base, line.displacement, amplitude);
        lineRef.current?.setPositions(line.scratch);
      }
      if (solid) {
        const position = solid.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        fillPositions(
          position.array as Float32Array,
          solid.base,
          solid.displacement,
          amplitude,
        );
        position.needsUpdate = true;
        // Las normales sólo se recalculan en reposo: durante la animación los
        // giros son pequeños y recalcularlas en cada cuadro no compensa.
        if (updateNormals) {
          solid.geometry.computeVertexNormals();
          solid.geometry.computeBoundingSphere();
        }

        const edges = solid.edgeGeometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        fillPositions(
          edges.array as Float32Array,
          solid.edgeBase,
          solid.edgeDisplacement,
          amplitude,
        );
        edges.needsUpdate = true;
      }
    },
    [line, solid],
  );

  useLayoutEffect(() => {
    // Siempre se fija la posición de reposo: también calcula las normales del
    // sólido antes del primer cuadro, aunque luego se anime.
    applyAmplitude(data.factor, true);
  }, [applyAmplitude, data.factor]);

  useFrame(({ clock }) => {
    if (!animateRef.current) return;
    const amplitude =
      data.factor * (0.58 + 0.42 * Math.sin(clock.elapsedTime * 1.7));
    applyAmplitude(amplitude, false);
  });

  // Al detener la animación se vuelve a la posición de reposo.
  useEffect(() => {
    if (!animate) applyAmplitude(data.factor, true);
  }, [animate, applyAmplitude, data.factor]);

  return (
    <group>
      {showGhost && (
        <FatLineSegments
          positions={ghost}
          color={light ? "#64748b" : "#94a3b8"}
          widthPx={GHOST_LINE_PX}
          opacity={light ? 0.55 : 0.42}
          dashed
          dashSize={Math.max(diagonal * 0.016, 1e-5)}
          gapSize={Math.max(diagonal * 0.011, 1e-5)}
          depthWrite={false}
          toneMapped={false}
          renderOrder={2}
        />
      )}
      {line && (
        <FatLineSegments
          ref={lineRef}
          positions={line.positions}
          colors={line.colors}
          widthPx={DEFORMED_LINE_PX}
          opacity={0.96}
          toneMapped={false}
          renderOrder={6}
        />
      )}
      {solid && (
        <group>
          <mesh geometry={solid.geometry} renderOrder={5} frustumCulled={false}>
            <meshStandardMaterial
              vertexColors
              side={THREE.DoubleSide}
              roughness={0.86}
              metalness={0}
              toneMapped={false}
            />
          </mesh>
          <lineSegments
            geometry={solid.edgeGeometry}
            renderOrder={6}
            frustumCulled={false}
          >
            <lineBasicMaterial
              color={light ? "#475569" : "#cbd5e1"}
              transparent
              opacity={light ? 0.3 : 0.22}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        </group>
      )}
    </group>
  );
}
