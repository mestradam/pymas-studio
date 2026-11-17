import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  add,
  distance,
  framePositions,
  modelBounds,
  pointAtStation,
  scale,
  type Vec3,
} from "./geometry";
import type { HeatmapScalar } from "./heatmap";
import { heatmapRange } from "./heatmap";

/**
 * Deformada elástica a partir de `internal_displacements`.
 *
 * pymas exporta los desplazamientos internos en el sistema **local** de la
 * barra. Para dibujar la curva se interpolan las tres componentes locales con
 * Hermite cúbico entre estaciones, se transforman a global con `local_axes` y
 * se suman a la posición indeformada.
 */

export const DEFAULT_DEFORMATION_STATIONS = [0, 0.25, 0.5, 0.75, 1];

export interface HermiteCurve {
  stations: number[];
  values: Vec3[];
}

export interface DeformationOptions {
  /** Factor de amplificación aplicado al desplazamiento global. */
  scale?: number;
  /** Subdivisiones por tramo entre estaciones (mínimo 2 para ver curvatura). */
  subdivisions?: number;
}

export interface DeformedFrameCurve {
  frameId: string;
  /** Estaciones originales exportadas. */
  sourceStations: number[];
  /** Estaciones densificadas por Hermite, normalizadas 0..1. */
  stations: number[];
  undeformedPoints: Vec3[];
  /** Desplazamientos locales interpolados. */
  localDisplacements: Vec3[];
  /** Desplazamientos globales (local -> global con los ejes de la barra). */
  globalDisplacements: Vec3[];
  deformedPoints: Vec3[];
  isVertical: boolean;
  maxMagnitude: number;
  heat: Record<HeatmapScalar, number[]>;
}

export interface DeformationModelData {
  frames: DeformedFrameCurve[];
  maxMagnitude: number;
  maxDrift: number;
}

export class MissingDeformationFrameError extends Error {
  constructor(frameId: string) {
    super(`No hay desplazamientos internos para la barra "${frameId}".`);
    this.name = "MissingDeformationFrameError";
  }
}

function sanitizeStations(stations: number[] | undefined): number[] {
  if (!Array.isArray(stations) || stations.length === 0) {
    return [...DEFAULT_DEFORMATION_STATIONS];
  }
  if (!stations.every((value) => Number.isFinite(value))) {
    return [...DEFAULT_DEFORMATION_STATIONS];
  }
  return [...stations];
}

function seriesAt(series: number[], index: number): number {
  const value = series[index];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function divide(a: Vec3, divisor: number): Vec3 {
  return divisor !== 0 ? [a[0] / divisor, a[1] / divisor, a[2] / divisor] : [0, 0, 0];
}

function vectorLength(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

/** Derivadas de los vectores respecto a la estación, con diferencias centradas. */
function estimateDerivatives(stations: number[], values: Vec3[]): Vec3[] {
  const count = values.length;
  const derivatives: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    if (count < 2) {
      derivatives.push([0, 0, 0]);
      continue;
    }
    const current = values[index] ?? [0, 0, 0];
    if (index === 0) {
      const next = values[1] ?? current;
      const dx = Math.max((stations[1] ?? 1) - (stations[0] ?? 0), 1e-15);
      derivatives.push(divide(subtract(next, current), dx));
    } else if (index === count - 1) {
      const previous = values[index - 1] ?? current;
      const dx = Math.max(
        (stations[index] ?? 1) - (stations[index - 1] ?? 0),
        1e-15,
      );
      derivatives.push(divide(subtract(current, previous), dx));
    } else {
      const previous = values[index - 1] ?? current;
      const next = values[index + 1] ?? current;
      const dx = Math.max(
        (stations[index + 1] ?? 1) - (stations[index - 1] ?? 0),
        1e-15,
      );
      derivatives.push(divide(subtract(next, previous), dx));
    }
  }
  return derivatives;
}

function hermiteValue(
  v0: Vec3,
  v1: Vec3,
  m0: Vec3,
  m1: Vec3,
  t: number,
  dx: number,
): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [
    h00 * v0[0] + h10 * dx * m0[0] + h01 * v1[0] + h11 * dx * m1[0],
    h00 * v0[1] + h10 * dx * m0[1] + h01 * v1[1] + h11 * dx * m1[1],
    h00 * v0[2] + h10 * dx * m0[2] + h01 * v1[2] + h11 * dx * m1[2],
  ];
}

/**
 * Interpolación cúbica de Hermite por tramos. En cada estación original la
 * curva pasa exactamente por el valor exportado y conserva continuidad C1.
 */
export function hermiteInterpolateVectors(
  stations: number[],
  values: Vec3[],
  subdivisions = 6,
): HermiteCurve {
  if (values.length === 0) return { stations: [], values: [] };
  if (values.length === 1) {
    return {
      stations: [0, 1],
      values: [
        [...(values[0] ?? [0, 0, 0])],
        [...(values[0] ?? [0, 0, 0])],
      ],
    };
  }

  const count = Math.min(stations.length, values.length);
  const xs = stations.slice(0, count);
  const ys = values.slice(0, count);
  const derivatives = estimateDerivatives(xs, ys);
  const steps = Math.max(2, Math.min(32, Math.floor(subdivisions)));
  const outStations: number[] = [];
  const outValues: Vec3[] = [];

  for (let segment = 0; segment < count - 1; segment += 1) {
    const x0 = xs[segment] ?? 0;
    const x1 = xs[segment + 1] ?? 1;
    const dx = x1 - x0;
    const v0 = ys[segment] ?? [0, 0, 0];
    const v1 = ys[segment + 1] ?? [0, 0, 0];
    const m0 = derivatives[segment] ?? [0, 0, 0];
    const m1 = derivatives[segment + 1] ?? [0, 0, 0];

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      outStations.push(x0 + t * dx);
      outValues.push(hermiteValue(v0, v1, m0, m1, t, dx));
    }
  }

  const lastIndex = count - 1;
  const lastX = xs[lastIndex] ?? 1;
  const lastV = ys[lastIndex] ?? [0, 0, 0];
  outStations.push(lastX);
  outValues.push([...lastV]);

  return { stations: outStations, values: outValues };
}

function localToGlobal(vector: Vec3, axes: { x: Vec3; y: Vec3; z: Vec3 }): Vec3 {
  return [
    vector[0] * axes.x[0] + vector[1] * axes.y[0] + vector[2] * axes.z[0],
    vector[0] * axes.x[1] + vector[1] * axes.y[1] + vector[2] * axes.z[1],
    vector[0] * axes.x[2] + vector[1] * axes.y[2] + vector[2] * axes.z[2],
  ];
}

export function buildDeformedFrame(
  model: PymasModel,
  result: PatternResultData,
  frameId: string,
  options: DeformationOptions = {},
): DeformedFrameCurve {
  const frame = model.frames[frameId];
  if (!frame) {
    throw new MissingDeformationFrameError(frameId);
  }
  const frameResult = result.frameResults[frameId];
  if (!frameResult) {
    throw new MissingDeformationFrameError(frameId);
  }

  const series = frameResult.internalDisplacements;
  const sourceStations = sanitizeStations(series.stations);
  const sourceValues: Vec3[] = sourceStations.map((_, index) => [
    seriesAt(series.ux, index),
    seriesAt(series.uy, index),
    seriesAt(series.uz, index),
  ]);

  const subdivisions =
    options.subdivisions ??
    Math.max(2, Math.min(8, Math.ceil(96 / Math.max(sourceStations.length - 1, 1))));
  const hermite = hermiteInterpolateVectors(sourceStations, sourceValues, subdivisions);
  const factor = Number.isFinite(options.scale) ? (options.scale ?? 1) : 1;

  const { p1, p2 } = framePositions(frame, model.nodes);
  const undeformedPoints = hermite.stations.map((station) =>
    pointAtStation(p1, p2, station),
  );
  const localDisplacements = hermite.values;
  const globalDisplacements = localDisplacements.map((value) =>
    localToGlobal(value, frame.localAxes),
  );
  const deformedPoints = undeformedPoints.map((point, index) =>
    add(point, scale(globalDisplacements[index] ?? [0, 0, 0], factor)),
  );

  const verticalSpan = Math.abs(p2[2] - p1[2]);
  const isVertical = verticalSpan / Math.max(frame.length, 1e-15) >= 0.5;
  const basePoint = undeformedPoints[0] ?? p1;
  const baseDisplacement = globalDisplacements[0] ?? [0, 0, 0];
  const magnitude: number[] = [];
  const ux: number[] = [];
  const uy: number[] = [];
  const uz: number[] = [];
  const drift: number[] = [];

  for (let index = 0; index < globalDisplacements.length; index += 1) {
    const displacement = globalDisplacements[index] ?? [0, 0, 0];
    const point = undeformedPoints[index] ?? basePoint;
    magnitude.push(vectorLength(displacement));
    ux.push(displacement[0]);
    uy.push(displacement[1]);
    uz.push(displacement[2]);
    const dz = Math.abs(point[2] - basePoint[2]);
    drift.push(
      isVertical && dz > 1e-12
        ? Math.hypot(
            displacement[0] - baseDisplacement[0],
            displacement[1] - baseDisplacement[1],
          ) / dz
        : 0,
    );
  }

  return {
    frameId,
    sourceStations,
    stations: hermite.stations,
    undeformedPoints,
    localDisplacements,
    globalDisplacements,
    deformedPoints,
    isVertical,
    maxMagnitude: magnitude.reduce((max, value) => Math.max(max, value), 0),
    heat: { magnitude, ux, uy, uz, drift },
  };
}

export function buildDeformation(
  model: PymasModel,
  result: PatternResultData,
  options: DeformationOptions = {},
): DeformationModelData {
  const frames: DeformedFrameCurve[] = [];
  let maxMagnitude = 0;
  let maxDrift = 0;

  for (const frameId of model.frameOrder) {
    if (!result.frameResults[frameId]) continue;
    const curve = buildDeformedFrame(model, result, frameId, options);
    frames.push(curve);
    maxMagnitude = Math.max(maxMagnitude, curve.maxMagnitude);
    for (const value of curve.heat.drift) maxDrift = Math.max(maxDrift, value);
  }

  return { frames, maxMagnitude, maxDrift };
}

/**
 * Rango del mapa de calor usando las estaciones exportadas (sin densificar).
 * Se comparte entre la escena y la leyenda para que los colores coincidan.
 */
export function deformationHeatRange(
  model: PymasModel,
  result: PatternResultData,
  scalar: HeatmapScalar,
): { min: number; max: number } {
  const values: number[] = [];

  for (const frameId of model.frameOrder) {
    const frame = model.frames[frameId];
    const frameResult = result.frameResults[frameId];
    if (!frame || !frameResult) continue;
    const series = frameResult.internalDisplacements;
    const stations = sanitizeStations(series.stations);
    const { p1, p2 } = framePositions(frame, model.nodes);
    const vertical = Math.abs(p2[2] - p1[2]) / Math.max(frame.length, 1e-15) >= 0.5;
    const baseDisplacement = localToGlobal(
      [seriesAt(series.ux, 0), seriesAt(series.uy, 0), seriesAt(series.uz, 0)],
      frame.localAxes,
    );

    for (let index = 0; index < stations.length; index += 1) {
      const displacement = localToGlobal(
        [
          seriesAt(series.ux, index),
          seriesAt(series.uy, index),
          seriesAt(series.uz, index),
        ],
        frame.localAxes,
      );
      switch (scalar) {
        case "magnitude":
          values.push(vectorLength(displacement));
          break;
        case "ux":
          values.push(displacement[0]);
          break;
        case "uy":
          values.push(displacement[1]);
          break;
        case "uz":
          values.push(displacement[2]);
          break;
        case "drift": {
          const point = pointAtStation(p1, p2, stations[index] ?? 0);
          const dz = Math.abs(point[2] - p1[2]);
          values.push(
            vertical && dz > 1e-12
              ? Math.hypot(
                  displacement[0] - baseDisplacement[0],
                  displacement[1] - baseDisplacement[1],
                ) / dz
              : 0,
          );
          break;
        }
      }
    }
  }

  return heatmapRange(values);
}

/**
 * Factor de amplificación automático: el desplazamiento máximo ocupa una
 * fracción de la diagonal del modelo. Si no hay desplazamientos, devuelve 1.
 */
export function autoDeformationScale(
  model: PymasModel,
  result: PatternResultData,
  targetFraction = 0.08,
): number {
  const target = modelBounds(model).diagonal * Math.abs(targetFraction);
  let maximum = 0;

  for (const frameId of model.frameOrder) {
    const frame = model.frames[frameId];
    const frameResult = result.frameResults[frameId];
    if (!frame || !frameResult) continue;
    const series = frameResult.internalDisplacements;
    const count = Math.max(
      series.ux.length,
      series.uy.length,
      series.uz.length,
      series.stations.length,
    );
    for (let index = 0; index < count; index += 1) {
      const local: Vec3 = [
        seriesAt(series.ux, index),
        seriesAt(series.uy, index),
        seriesAt(series.uz, index),
      ];
      const global = localToGlobal(local, frame.localAxes);
      maximum = Math.max(maximum, vectorLength(global));
    }
  }

  return maximum > 1e-15 && Number.isFinite(maximum) ? target / maximum : 1;
}

/** Distancia entre extremos deformados; útil para pruebas y encuadres. */
export function deformedSpan(curve: DeformedFrameCurve): number {
  const first = curve.deformedPoints[0];
  const last = curve.deformedPoints[curve.deformedPoints.length - 1];
  return first && last ? distance(first, last) : 0;
}
