import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ColorMode } from "../../engine/colors";
import { frameColor } from "../../engine/colors";
import {
  framePositions,
  sectionDisplayDimensions,
  type Vec3,
} from "../../engine/geometry";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import { useModelStore, type RenderMode } from "../../store/useModelStore";
import type { HeatmapMode } from "../../engine/heatmap";
import { heatmapColor } from "../../engine/heatmap";
import {
  frameHeatStations,
  resultHeatRange,
} from "../../engine/resultHeatmap";
import { useThemeStore } from "../../store/useThemeStore";

interface FrameMeshProps {
  model: PymasModel;
  result?: PatternResultData | null;
  heatmapMode: HeatmapMode;
  renderMode: RenderMode;
  colorMode: ColorMode;
  opacity: number;
  sectionScale: number;
  diagonal: number;
  /** Sustituye el color por barra (por ejemplo, mapa de calor A/B). */
  colorForFrame?: (frameId: string) => string | null;
}

interface StationValue {
  station: number;
  value: number;
}

/** Caras de una caja unitaria; los vértices 0-3 están en x0 y 4-7 en x1. */
const BOX_FACES: Array<[number, number, number]> = [
  [0, 3, 2],
  [0, 2, 1],
  [4, 5, 6],
  [4, 6, 7],
  [0, 4, 7],
  [0, 7, 3],
  [1, 2, 6],
  [1, 6, 5],
  [0, 1, 5],
  [0, 5, 4],
  [3, 7, 6],
  [3, 6, 2],
];

const CORNERS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

function sanitizeStations(
  stations: number[],
  values: number[],
): StationValue[] {
  const pairs: StationValue[] = [];
  const count = Math.min(stations.length, values.length);
  for (let index = 0; index < count; index += 1) {
    const station = stations[index];
    const value = values[index];
    if (
      station === undefined ||
      value === undefined ||
      !Number.isFinite(station) ||
      !Number.isFinite(value)
    ) {
      continue;
    }
    pairs.push({
      station: Math.min(1, Math.max(0, station)),
      value,
    });
  }
  pairs.sort((a, b) => a.station - b.station);

  const unique: StationValue[] = [];
  for (const pair of pairs) {
    const last = unique[unique.length - 1];
    if (!last || pair.station - last.station > 1e-9) unique.push(pair);
  }

  if (unique.length === 0) {
    return [
      { station: 0, value: 0 },
      { station: 1, value: 0 },
    ];
  }
  const first = unique[0];
  const last = unique[unique.length - 1];
  if (first && first.station > 1e-9) {
    unique.unshift({ station: 0, value: first.value });
  }
  if (last && last.station < 1 - 1e-9) {
    unique.push({ station: 1, value: last.value });
  }
  if (unique.length === 1) {
    unique.push({ ...unique[0]! });
  }
  return unique;
}

export default function FrameMesh({
  model,
  result,
  heatmapMode,
  renderMode,
  colorMode,
  opacity,
  sectionScale,
  diagonal,
  colorForFrame,
}: FrameMeshProps) {
  const theme = useThemeStore((state) => state.theme);
  const upAxis = useModelStore((state) => state.upAxis);
  const scalar = heatmapMode === "none" ? null : heatmapMode;

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
    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
    };
  }, [model, colorMode, colorForFrame]);

  const heatRange = useMemo(() => {
    if (renderMode === "wire" || !result || !scalar) return null;
    const range = resultHeatRange(model, result, scalar, upAxis);
    return range.max - range.min > 1e-15 ? range : null;
  }, [model, result, scalar, renderMode, upAxis]);

  const extruded = useMemo(() => {
    if (renderMode === "wire") {
      return {
        geometry: new THREE.BufferGeometry(),
        edgeGeometry: new THREE.BufferGeometry(),
        empty: true,
      };
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const edges: number[] = [];
    const minDimension = Math.max(diagonal * 0.0018, 1e-6);

    const pushVertex = (
      point: Vec3,
      color: [number, number, number],
    ): void => {
      positions.push(point[0], point[1], point[2]);
      colors.push(color[0], color[1], color[2]);
    };

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
      const halfY = Math.max(dims.dy * sectionScale, minDimension) / 2;
      const halfZ = Math.max(dims.dz * sectionScale, minDimension) / 2;
      const { p1 } = framePositions(frame, model.nodes);
      const { x: ex, y: ey, z: ez } = frame.localAxes;
      const length = Math.max(frame.length, 1e-6);

      const override = colorForFrame?.(frameId) ?? null;
      const baseColor = override ?? frameColor(frame, model, colorMode);
      const base = new THREE.Color(baseColor);

      let stations: StationValue[];
      let heatAvailable = false;
      if (result && scalar && heatRange) {
        try {
          const series = frameHeatStations(model, result, frameId, scalar, {
            subdivisions: 6,
            upAxis,
          });
          if (series) {
            stations = sanitizeStations(series.stations, series.values);
            heatAvailable = true;
          } else {
            stations = [
              { station: 0, value: 0 },
              { station: 1, value: 0 },
            ];
          }
        } catch {
          stations = [
            { station: 0, value: 0 },
            { station: 1, value: 0 },
          ];
        }
      } else {
        stations = [
          { station: 0, value: 0 },
          { station: 1, value: 0 },
        ];
      }

      const stationColors: Array<[number, number, number]> = stations.map(
        (entry) => {
          if (override) return [base.r, base.g, base.b];
          if (scalar && heatRange && heatAvailable) {
            const [r, g, b] = heatmapColor(
              entry.value,
              heatRange.min,
              heatRange.max,
            );
            const color = new THREE.Color().setRGB(
              r,
              g,
              b,
              THREE.SRGBColorSpace,
            );
            return [color.r, color.g, color.b];
          }
          return [base.r, base.g, base.b];
        },
      );

      const globalPoint = (lx: number, ly: number, lz: number): Vec3 => [
        p1[0] + ex[0] * lx + ey[0] * ly + ez[0] * lz,
        p1[1] + ex[1] * lx + ey[1] * ly + ez[1] * lz,
        p1[2] + ex[2] * lx + ey[2] * ly + ez[2] * lz,
      ];

      for (let index = 0; index < stations.length - 1; index += 1) {
        const left = stations[index];
        const right = stations[index + 1];
        if (!left || !right) continue;
        const x0 = left.station * length;
        const x1 = right.station * length;
        const startColor = stationColors[index] ?? [base.r, base.g, base.b];
        const endColor = stationColors[index + 1] ?? startColor;

        const localCorners: Vec3[] = [
          [x0, -halfY, -halfZ],
          [x0, halfY, -halfZ],
          [x0, halfY, halfZ],
          [x0, -halfY, halfZ],
          [x1, -halfY, -halfZ],
          [x1, halfY, -halfZ],
          [x1, halfY, halfZ],
          [x1, -halfY, halfZ],
        ];
        const points = localCorners.map((corner) =>
          globalPoint(corner[0], corner[1], corner[2]),
        );
        const vertexColors = [
          startColor,
          startColor,
          startColor,
          startColor,
          endColor,
          endColor,
          endColor,
          endColor,
        ];

        for (const face of BOX_FACES) {
          for (const vertexIndex of face) {
            const point = points[vertexIndex];
            const color = vertexColors[vertexIndex];
            if (point && color) pushVertex(point, color);
          }
        }
      }

      // Aristas solo en el contorno longitudinal y las tapas: delimitan el
      // volumen sin dibujar una retícula sobre cada subdivisión interna.
      const edgePoints = CORNERS.map(([sy, sz]) => [
        globalPoint(0, sy * halfY, sz * halfZ),
        globalPoint(length, sy * halfY, sz * halfZ),
      ] as const);
      for (const [a, b] of edgePoints) {
        edges.push(...a, ...b);
      }
      for (let index = 0; index < 4; index += 1) {
        const current = CORNERS[index];
        const next = CORNERS[(index + 1) % 4];
        if (!current || !next) continue;
        const a = globalPoint(0, current[0] * halfY, current[1] * halfZ);
        const b = globalPoint(0, next[0] * halfY, next[1] * halfZ);
        const c = globalPoint(length, current[0] * halfY, current[1] * halfZ);
        const d = globalPoint(length, next[0] * halfY, next[1] * halfZ);
        edges.push(...a, ...b, ...c, ...d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    geometry.computeVertexNormals();

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(edges, 3),
    );

    return { geometry, edgeGeometry, empty: positions.length === 0 };
  }, [
    model,
    result,
    scalar,
    heatRange,
    renderMode,
    colorMode,
    sectionScale,
    diagonal,
    colorForFrame,
    upAxis,
  ]);

  useEffect(
    () => () => {
      extruded.geometry.dispose();
      extruded.edgeGeometry.dispose();
    },
    [extruded],
  );

  if (renderMode === "wire") {
    return (
      <lineSegments renderOrder={2}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[wire.positions, 3]}
          />
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

  if (extruded.empty) return null;

  const heatActive = Boolean(colorForFrame) || Boolean(heatRange);
  const light = theme === "light";
  const materialOpacity = heatActive ? 1 : opacity;

  return (
    <group>
      <mesh geometry={extruded.geometry} renderOrder={2}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.86}
          metalness={0}
          emissiveIntensity={0}
          toneMapped={false}
          transparent={materialOpacity < 0.99}
          opacity={materialOpacity}
          depthWrite={materialOpacity > 0.7}
        />
      </mesh>
      <lineSegments geometry={extruded.edgeGeometry} renderOrder={3}>
        <lineBasicMaterial
          color={light ? "#475569" : "#cbd5e1"}
          transparent
          opacity={light ? 0.3 : 0.22}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}
