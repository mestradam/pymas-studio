import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import {
  autoDiagramScale,
  buildFrameDiagram,
  FORCE_LABELS,
  type DiagramPeak,
  type DiagramSeries,
  type ForceComponent,
} from "../../engine/diagrams";
import { formatNumber } from "../../engine/geometry";
import { useModelStore } from "../../store/useModelStore";
import { useThemeStore } from "../../store/useThemeStore";

interface ForceDiagrams3DProps {
  model: PymasModel;
  result: PatternResultData;
}

const POSITIVE: [number, number, number] = [0.13, 0.83, 0.93];
const NEGATIVE: [number, number, number] = [0.98, 0.45, 0.52];
const POSITIVE_LIGHT: [number, number, number] = [0.02, 0.32, 0.42];
const NEGATIVE_LIGHT: [number, number, number] = [0.72, 0.06, 0.19];

function signColor(
  value: number,
  light: boolean,
): [number, number, number] {
  if (value >= 0) return light ? POSITIVE_LIGHT : POSITIVE;
  return light ? NEGATIVE_LIGHT : NEGATIVE;
}

interface ExtremeLabel {
  key: string;
  component: ForceComponent;
  value: number;
  position: [number, number, number];
}

/**
 * Diagramas 3D de acciones internas. Cada componente se dibuja sobre el eje
 * local que le corresponde (`fy/mz → y`; `fx/fz/mx/my → z`) con relleno
 * semitransparente, color por signo y etiquetas en los extremos globales.
 */
export default function ForceDiagrams3D({
  model,
  result,
}: ForceDiagrams3DProps) {
  const components = useModelStore((state) => state.diagramComponents);
  const diagramScale = useModelStore((state) => state.diagramScale);
  const showLabels = useModelStore((state) => state.showDiagramLabels);
  const theme = useThemeStore((state) => state.theme);
  const light = theme === "light";

  const data = useMemo(() => {
    if (components.length === 0) return null;
    const autoScale = autoDiagramScale(model, result, {
      targetFraction: 0.12,
      components,
    });
    const factor = autoScale * diagramScale;
    const series: DiagramSeries[] = [];
    for (const frameId of model.frameOrder) {
      if (!result.frameResults[frameId]) continue;
      for (const component of components) {
        series.push(buildFrameDiagram(model, result, frameId, component, factor));
      }
    }

    const fillPositions: number[] = [];
    const fillColors: number[] = [];
    const linePositions: number[] = [];
    const lineColors: number[] = [];

    const push = (target: number[], values: number[]) => {
      target.push(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0);
    };

    for (const entry of series) {
      const count = entry.stations.length;
      for (let index = 0; index < count - 1; index += 1) {
        const v0 = entry.values[index] ?? 0;
        const v1 = entry.values[index + 1] ?? 0;
        if (Math.abs(v0) < 1e-12 && Math.abs(v1) < 1e-12) continue;
        const p0 = entry.points[index] ?? [0, 0, 0];
        const p1 = entry.points[index + 1] ?? [0, 0, 0];
        const d0 = entry.displayPoints[index] ?? [0, 0, 0];
        const d1 = entry.displayPoints[index + 1] ?? [0, 0, 0];

        // Triángulo 1: base_i, curva_i, curva_{i+1}
        push(fillPositions, p0);
        push(fillPositions, d0);
        push(fillPositions, d1);
        fillColors.push(
          ...signColor(v0, light),
          ...signColor(v0, light),
          ...signColor(v1, light),
        );

        // Triángulo 2: base_i, curva_{i+1}, base_{i+1}
        push(fillPositions, p0);
        push(fillPositions, d1);
        push(fillPositions, p1);
        fillColors.push(
          ...signColor(v0, light),
          ...signColor(v1, light),
          ...signColor(v1, light),
        );

        // Contorno superior del diagrama.
        push(linePositions, d0);
        push(linePositions, d1);
        lineColors.push(...signColor(v0, light), ...signColor(v1, light));
      }
    }

    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(fillPositions), 3),
    );
    fillGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(fillColors), 3),
    );
    const fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.renderOrder = 3;

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(linePositions), 3),
    );
    lineGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(lineColors), 3),
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
    const outline = new THREE.LineSegments(lineGeometry, lineMaterial);
    outline.renderOrder = 4;

    const labels: ExtremeLabel[] = [];
    for (const component of components) {
      const ofComponent = series.filter((entry) => entry.component === component);
      if (ofComponent.length === 0) continue;
      let maxPeak: DiagramPeak | null = null;
      let minPeak: DiagramPeak | null = null;
      for (const entry of ofComponent) {
        if (!maxPeak || entry.max.value > maxPeak.value) maxPeak = entry.max;
        if (!minPeak || entry.min.value < minPeak.value) minPeak = entry.min;
      }
      if (maxPeak && Math.abs(maxPeak.value) > 1e-9) {
        labels.push({
          key: `${component}-max`,
          component,
          value: maxPeak.value,
          position: maxPeak.display,
        });
      }
      if (
        minPeak &&
        Math.abs(minPeak.value) > 1e-9 &&
        (!maxPeak || Math.abs(minPeak.value - maxPeak.value) > 1e-9)
      ) {
        labels.push({
          key: `${component}-min`,
          component,
          value: minPeak.value,
          position: minPeak.display,
        });
      }
    }

    return {
      fill: { object: fill, geometry: fillGeometry, material: fillMaterial },
      outline: {
        object: outline,
        geometry: lineGeometry,
        material: lineMaterial,
      },
      labels,
    };
  }, [model, result, components, diagramScale, light]);

  useEffect(() => {
    if (!data) return;
    return () => {
      data.fill.geometry.dispose();
      data.fill.material.dispose();
      data.outline.geometry.dispose();
      data.outline.material.dispose();
    };
  }, [data]);

  if (!data) return null;

  const forceUnit = model.meta.units.force;
  const lengthUnit = model.meta.units.length;

  return (
    <group>
      <primitive object={data.fill.object} />
      <primitive object={data.outline.object} />
      {showLabels &&
        data.labels.map((label) => {
          const isMoment = label.component.startsWith("m");
          const unit = isMoment ? `${forceUnit}·${lengthUnit}` : forceUnit;
          return (
            <Html
              key={label.key}
              position={label.position}
              center
              zIndexRange={[12, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div
                className="whitespace-nowrap rounded border px-1 py-0.5 font-mono text-[9px] leading-none shadow-md"
                style={{
                  color:
                    label.value >= 0
                      ? "var(--label-positive)"
                      : "var(--label-negative)",
                  borderColor:
                    label.value >= 0
                      ? "var(--label-positive-border)"
                      : "var(--label-negative-border)",
                  backgroundColor: "var(--label-bg)",
                }}
              >
                {FORCE_LABELS[label.component]} {formatNumber(label.value)} {unit}
              </div>
            </Html>
          );
        })}
    </group>
  );
}
