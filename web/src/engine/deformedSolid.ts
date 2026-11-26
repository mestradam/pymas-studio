import type { FrameData, PymasModel } from "../types/pymas";
import type { DeformedFrameCurve } from "./deformation";
import { sectionDisplayDimensions, type Vec3 } from "./geometry";

/**
 * Sólido extruido de la deformada.
 *
 * Cada barra se dibuja como una sucesión de cajas `dy × dz` entre las
 * estaciones densificadas de la curva deformada. Con la hipótesis de pequeños
 * giros, una esquina de la sección situada en `r = sy·halfY·ey + sz·halfZ·ez`
 * respecto al eje se desplaza
 *
 *     d = u + θ × r
 *
 * donde `u` y `θ` son el desplazamiento y el giro globales de la estación. La
 * posición dibujada es `base + factor · d`: lineal en el factor de
 * amplificación, así que la animación armónica sólo reescala `d` sin
 * reconstruir la geometría, y la sección gira con la flexión y la torsión.
 */

/** Caras de una caja; los vértices 0-3 están en x0 y 4-7 en x1. */
export const BOX_FACES: Array<[number, number, number]> = [
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

/** Esquinas de la sección en signos (sy, sz), en orden perimetral. */
export const CORNERS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** Semiancho y semialto de la sección dibujada de una barra. */
export function frameSectionHalfExtents(
  model: PymasModel,
  frame: FrameData,
  sectionScale: number,
  minDimension: number,
): { halfY: number; halfZ: number } {
  const section = model.sections[frame.sectionId];
  const dims = section
    ? sectionDisplayDimensions(section)
    : { dy: minDimension, dz: minDimension };
  return {
    halfY: Math.max(dims.dy * sectionScale, minDimension) / 2,
    halfZ: Math.max(dims.dz * sectionScale, minDimension) / 2,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export interface DeformedSolidFrame {
  /** Triángulos sin indexar: posición indeformada de cada vértice. */
  base: number[];
  /** Desplazamiento unitario (factor = 1) de cada vértice. */
  displacement: number[];
  /** Índice de estación de la curva al que pertenece cada vértice. */
  stationIndex: number[];
  /** Aristas (pares de puntos): contorno longitudinal y tapas. */
  edgeBase: number[];
  edgeDisplacement: number[];
}

/**
 * Construye la caja deformada de una barra a partir de su curva deformada
 * (`buildDeformedFrame`). No aplica factor: devuelve base y desplazamiento.
 */
export function buildDeformedSolidFrame(
  curve: DeformedFrameCurve,
  frame: FrameData,
  halfY: number,
  halfZ: number,
): DeformedSolidFrame {
  const { y: ey, z: ez } = frame.localAxes;
  const base: number[] = [];
  const displacement: number[] = [];
  const stationIndex: number[] = [];
  const edgeBase: number[] = [];
  const edgeDisplacement: number[] = [];

  const count = curve.stations.length;
  // Esquinas de cada estación: [base, desplazamiento].
  const corners: Array<Array<[Vec3, Vec3]>> = [];
  for (let index = 0; index < count; index += 1) {
    const point = curve.undeformedPoints[index] ?? [0, 0, 0];
    const u = curve.globalDisplacements[index] ?? [0, 0, 0];
    const theta = curve.globalRotations[index] ?? [0, 0, 0];
    corners.push(
      CORNERS.map(([sy, sz]) => {
        const r: Vec3 = [
          sy * halfY * ey[0] + sz * halfZ * ez[0],
          sy * halfY * ey[1] + sz * halfZ * ez[1],
          sy * halfY * ey[2] + sz * halfZ * ez[2],
        ];
        const spin = cross(theta, r);
        return [
          [point[0] + r[0], point[1] + r[1], point[2] + r[2]],
          [u[0] + spin[0], u[1] + spin[1], u[2] + spin[2]],
        ];
      }),
    );
  }

  for (let index = 0; index < count - 1; index += 1) {
    const box = [...(corners[index] ?? []), ...(corners[index + 1] ?? [])];
    if (box.length !== 8) continue;
    for (const face of BOX_FACES) {
      for (const vertex of face) {
        const corner = box[vertex];
        if (!corner) continue;
        base.push(...corner[0]);
        displacement.push(...corner[1]);
        stationIndex.push(vertex < 4 ? index : index + 1);
      }
    }
  }

  const pushEdge = (a: [Vec3, Vec3] | undefined, b: [Vec3, Vec3] | undefined) => {
    if (!a || !b) return;
    edgeBase.push(...a[0], ...b[0]);
    edgeDisplacement.push(...a[1], ...b[1]);
  };
  // Contorno longitudinal: cada esquina recorre todas las estaciones.
  for (let corner = 0; corner < CORNERS.length; corner += 1) {
    for (let index = 0; index < count - 1; index += 1) {
      pushEdge(corners[index]?.[corner], corners[index + 1]?.[corner]);
    }
  }
  // Tapas en los extremos.
  for (const end of [0, count - 1]) {
    const ring = corners[end];
    if (!ring) continue;
    for (let corner = 0; corner < CORNERS.length; corner += 1) {
      pushEdge(ring[corner], ring[(corner + 1) % CORNERS.length]);
    }
  }

  return { base, displacement, stationIndex, edgeBase, edgeDisplacement };
}

/** Interpolación lineal de una serie escalar en nuevas estaciones. */
export function interpolateScalarSeries(
  stations: number[],
  values: number[],
  targetStations: number[],
): number[] {
  const count = Math.min(stations.length, values.length);
  if (count === 0) return targetStations.map(() => 0);
  if (count === 1) return targetStations.map(() => values[0] ?? 0);
  return targetStations.map((station) => {
    if (station <= (stations[0] ?? 0)) return values[0] ?? 0;
    for (let index = 0; index < count - 1; index += 1) {
      const x0 = stations[index] ?? 0;
      const x1 = stations[index + 1] ?? 1;
      if (station <= x1) {
        const v0 = values[index] ?? 0;
        const v1 = values[index + 1] ?? 0;
        const t = x1 - x0 > 1e-15 ? (station - x0) / (x1 - x0) : 1;
        return v0 + (v1 - v0) * t;
      }
    }
    return values[count - 1] ?? 0;
  });
}
