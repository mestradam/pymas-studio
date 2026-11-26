import type { FrameData, PatternResultData, PymasModel } from "../types/pymas";
import {
  add,
  distance,
  framePositions,
  modelBounds,
  pointAtStation,
  scale,
  type Vec3,
} from "./geometry";
import type { DeformationScalar } from "./heatmap";
import { heatmapRange } from "./heatmap";
import { DEFAULT_UP_AXIS, horizontalAxisIndices, upAxisIndex, type UpAxis } from "./upAxis";

/**
 * Deformada elástica a partir de `internal_displacements`.
 *
 * pymas exporta los desplazamientos internos en el sistema **local** de la
 * barra. Para dibujar la curva se interpolan las tres componentes locales con
 * Hermite cúbico entre estaciones, se transforman a global con `local_axes` y
 * se suman a la posición indeformada.
 *
 * Las barras de celosía (`bar`, `plane_truss`, `space_truss` o con rigidez a
 * flexión desactivada) son una excepción: pymas sólo exporta su componente
 * axial, así que la deformada se reconstruye interpolando linealmente los
 * desplazamientos nodales. El resultado es la cuerda recta entre los dos nudos
 * desplazados, sin las oscilaciones que produciría Hermite sobre datos
 * incompletos.
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
  /** Eje vertical del modelo; define qué barras son columnas para la deriva. */
  upAxis?: UpAxis;
}

/** Fracción mínima de la longitud que debe ser vertical para contar como columna. */
const VERTICAL_RATIO = 0.5;

function isVerticalSpan(p1: Vec3, p2: Vec3, length: number, up: UpAxis): boolean {
  const axis = upAxisIndex(up);
  const span = Math.abs((p2[axis] ?? 0) - (p1[axis] ?? 0));
  return span / Math.max(length, 1e-15) >= VERTICAL_RATIO;
}

/**
 * Deriva = desplazamiento horizontal relativo a la base de la barra dividido
 * por la altura sobre esa base. Sólo se evalúa en barras verticales.
 */
function driftAt(
  vertical: boolean,
  point: Vec3,
  basePoint: Vec3,
  displacement: Vec3,
  baseDisplacement: Vec3,
  up: UpAxis,
): number {
  if (!vertical) return 0;
  const axis = upAxisIndex(up);
  const height = Math.abs((point[axis] ?? 0) - (basePoint[axis] ?? 0));
  if (height <= 1e-12) return 0;
  const [h1, h2] = horizontalAxisIndices(up);
  return (
    Math.hypot(
      (displacement[h1] ?? 0) - (baseDisplacement[h1] ?? 0),
      (displacement[h2] ?? 0) - (baseDisplacement[h2] ?? 0),
    ) / height
  );
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
  heat: Record<DeformationScalar, number[]>;
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

function globalToLocal(vector: Vec3, axes: { x: Vec3; y: Vec3; z: Vec3 }): Vec3 {
  return [
    vector[0] * axes.x[0] + vector[1] * axes.x[1] + vector[2] * axes.x[2],
    vector[0] * axes.y[0] + vector[1] * axes.y[1] + vector[2] * axes.y[2],
    vector[0] * axes.z[0] + vector[1] * axes.z[1] + vector[2] * axes.z[2],
  ];
}

/**
 * Una barra se dibuja como celosía cuando el modelo lo declara (`bar`,
 * `plane_truss`, `space_truss`) o cuando no tiene rigidez a flexión en ningún
 * eje. En esos casos pymas sólo exporta la componente axial de los
 * desplazamientos internos y la deformada debe reconstruirse con los
 * desplazamientos nodales.
 */
export function isTrussFrame(model: PymasModel, frame: FrameData): boolean {
  const type = model.meta.type.toLowerCase();
  if (type.includes("truss") || type === "bar") return true;
  return !frame.stiffness.bending_y && !frame.stiffness.bending_z;
}

function subdivisionsFor(options: DeformationOptions, stationCount: number): number {
  const requested =
    options.subdivisions ??
    Math.max(2, Math.min(8, Math.ceil(96 / Math.max(stationCount - 1, 1))));
  return Math.max(2, Math.min(32, Math.floor(requested)));
}

/** Estaciones densificadas con la misma rejilla que usa Hermite. */
function densifyStations(sourceStations: number[], subdivisions: number): number[] {
  const xs = sourceStations.length >= 2 ? sourceStations : [0, 1];
  const steps = Math.max(2, Math.min(32, Math.floor(subdivisions)));
  const outStations: number[] = [];
  for (let segment = 0; segment < xs.length - 1; segment += 1) {
    const x0 = xs[segment] ?? 0;
    const x1 = xs[segment + 1] ?? 1;
    const dx = x1 - x0;
    for (let step = 0; step < steps; step += 1) {
      outStations.push(x0 + (step / steps) * dx);
    }
  }
  outStations.push(xs[xs.length - 1] ?? 1);
  return outStations;
}

function nodalDisplacement(result: PatternResultData, nodeId: string): Vec3 | undefined {
  const displacement = result.nodalDisplacements[nodeId];
  if (!displacement) return undefined;
  return [displacement.ux, displacement.uy, displacement.uz];
}

/**
 * Cuerda recta entre los nudos desplazados de una barra de celosía. Devuelve
 * `null` si faltan los desplazamientos nodales para reconstruirla.
 */
function interpolateNodalDisplacements(
  result: PatternResultData,
  frame: FrameData,
  stations: number[],
): Vec3[] | null {
  const uI = nodalDisplacement(result, frame.nodeI);
  const uJ = nodalDisplacement(result, frame.nodeJ);
  if (!uI || !uJ) return null;
  return stations.map((station) => [
    (1 - station) * uI[0] + station * uJ[0],
    (1 - station) * uI[1] + station * uJ[1],
    (1 - station) * uI[2] + station * uJ[2],
  ]);
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
  const factor = Number.isFinite(options.scale) ? (options.scale ?? 1) : 1;
  const { p1, p2 } = framePositions(frame, model.nodes);

  const sourceStations = sanitizeStations(series.stations);
  const subdivisions = subdivisionsFor(options, sourceStations.length);
  const truss = isTrussFrame(model, frame);
  const trussStations = truss ? densifyStations(sourceStations, subdivisions) : null;
  const trussDisplacements = trussStations
    ? interpolateNodalDisplacements(result, frame, trussStations)
    : null;

  let stations: number[];
  let localDisplacements: Vec3[];
  let globalDisplacements: Vec3[];

  if (trussStations && trussDisplacements) {
    stations = trussStations;
    globalDisplacements = trussDisplacements;
    localDisplacements = trussDisplacements.map((value) =>
      globalToLocal(value, frame.localAxes),
    );
  } else {
    const sourceValues: Vec3[] = sourceStations.map((_, index) => [
      seriesAt(series.ux, index),
      seriesAt(series.uy, index),
      seriesAt(series.uz, index),
    ]);
    const hermite = hermiteInterpolateVectors(sourceStations, sourceValues, subdivisions);
    stations = hermite.stations;
    localDisplacements = hermite.values;
    globalDisplacements = localDisplacements.map((value) =>
      localToGlobal(value, frame.localAxes),
    );
  }

  const undeformedPoints = stations.map((station) => pointAtStation(p1, p2, station));
  const deformedPoints = undeformedPoints.map((point, index) =>
    add(point, scale(globalDisplacements[index] ?? [0, 0, 0], factor)),
  );

  const up = options.upAxis ?? DEFAULT_UP_AXIS;
  const isVertical = isVerticalSpan(p1, p2, frame.length, up);
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
    drift.push(
      driftAt(isVertical, point, basePoint, displacement, baseDisplacement, up),
    );
  }

  return {
    frameId,
    sourceStations,
    stations,
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
  scalar: DeformationScalar,
  upAxis: UpAxis = DEFAULT_UP_AXIS,
): { min: number; max: number } {
  const values: number[] = [];

  for (const frameId of model.frameOrder) {
    const frame = model.frames[frameId];
    const frameResult = result.frameResults[frameId];
    if (!frame || !frameResult) continue;
    const series = frameResult.internalDisplacements;
    const stations = sanitizeStations(series.stations);
    const { p1, p2 } = framePositions(frame, model.nodes);
    const vertical = isVerticalSpan(p1, p2, frame.length, upAxis);
    const trussDisplacements = isTrussFrame(model, frame)
      ? interpolateNodalDisplacements(result, frame, stations)
      : null;
    const displacements =
      trussDisplacements ??
      stations.map((_, index) =>
        localToGlobal(
          [
            seriesAt(series.ux, index),
            seriesAt(series.uy, index),
            seriesAt(series.uz, index),
          ],
          frame.localAxes,
        ),
      );
    const baseDisplacement = displacements[0] ?? [0, 0, 0];

    for (let index = 0; index < stations.length; index += 1) {
      const displacement = displacements[index] ?? [0, 0, 0];
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
          values.push(
            driftAt(vertical, point, p1, displacement, baseDisplacement, upAxis),
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
    const trussDisplacements = isTrussFrame(model, frame)
      ? interpolateNodalDisplacements(result, frame, sanitizeStations(series.stations))
      : null;
    if (trussDisplacements) {
      for (const global of trussDisplacements) {
        maximum = Math.max(maximum, vectorLength(global));
      }
      continue;
    }

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

/** Punto de la curva deformada en una estación normalizada 0..1. */
export function deformedPointAt(
  curve: DeformedFrameCurve,
  station: number,
): Vec3 {
  const points = curve.deformedPoints;
  if (points.length === 0) return [0, 0, 0];
  const stations = curve.stations;
  if (stations.length !== points.length) return [...(points[0] ?? [0, 0, 0])];

  const first = stations[0] ?? 0;
  const last = stations[stations.length - 1] ?? 1;
  if (!Number.isFinite(station) || station <= first) {
    return [...(points[0] ?? [0, 0, 0])];
  }
  if (station >= last) {
    return [...(points[points.length - 1] ?? [0, 0, 0])];
  }

  for (let index = 0; index < stations.length - 1; index += 1) {
    const x0 = stations[index];
    const x1 = stations[index + 1];
    if (x0 === undefined || x1 === undefined) continue;
    if (station >= x0 && station <= x1) {
      const p0 = points[index] ?? [0, 0, 0];
      const p1 = points[index + 1] ?? [0, 0, 0];
      if (Math.abs(x1 - x0) < 1e-15) return [...p1];
      const t = (station - x0) / (x1 - x0);
      return [
        p0[0] + (p1[0] - p0[0]) * t,
        p0[1] + (p1[1] - p0[1]) * t,
        p0[2] + (p1[2] - p0[2]) * t,
      ];
    }
  }
  return [...(points[points.length - 1] ?? [0, 0, 0])];
}

/** Distancia entre extremos deformados; útil para pruebas y encuadres. */
export function deformedSpan(curve: DeformedFrameCurve): number {
  const first = curve.deformedPoints[0];
  const last = curve.deformedPoints[curve.deformedPoints.length - 1];
  return first && last ? distance(first, last) : 0;
}
