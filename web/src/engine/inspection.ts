import type {
  FrameStationDisplacements,
  FrameStationForces,
  PatternResultData,
  PymasModel,
} from "../types/pymas";
import {
  FORCE_COMPONENTS,
  FORCE_LONG_LABELS,
  type ForceComponent,
} from "./diagrams";
import { buildDeformedFrame } from "./deformation";
import { isFiniteNumber } from "./geometry";

/**
 * Utilidades puras del inspector de elementos y de las tablas de resultados.
 *
 * Todas las series se mantienen en coordenadas **locales** de la barra y con
 * estaciones normalizadas 0..1; la UI las convierte a `x ∈ [0, L]`.
 */

/** Movimientos globales: desplazamientos (`u*`) y giros (`r*`). */
export const MOVEMENT_COMPONENTS = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;
export type MovementComponent = (typeof MOVEMENT_COMPONENTS)[number];
export type FrameChartKey = ForceComponent | MovementComponent;
export type ChartFamily = "force" | "moment" | "displacement" | "rotation";

export interface FrameChartSeries {
  key: FrameChartKey;
  label: string;
  family: ChartFamily;
  stations: number[];
  values: number[];
}

export const FRAME_CHART_ORDER: readonly FrameChartKey[] = [
  "fx",
  "fy",
  "fz",
  "mx",
  "my",
  "mz",
  ...MOVEMENT_COMPONENTS,
];

export const FRAME_CHART_LABELS: Record<FrameChartKey, string> = {
  ...FORCE_LONG_LABELS,
  ux: "ux · desplazamiento global",
  uy: "uy · desplazamiento global",
  uz: "uz · desplazamiento global",
  rx: "rx · giro global",
  ry: "ry · giro global",
  rz: "rz · giro global",
};

export const FRAME_CHART_FAMILY: Record<FrameChartKey, ChartFamily> = {
  fx: "force",
  fy: "force",
  fz: "force",
  mx: "moment",
  my: "moment",
  mz: "moment",
  ux: "displacement",
  uy: "displacement",
  uz: "displacement",
  rx: "rotation",
  ry: "rotation",
  rz: "rotation",
};

export function interpolateSeriesAt(
  stations: readonly number[],
  values: readonly number[],
  station: number,
): number {
  if (values.length === 0) return 0;
  if (stations.length !== values.length || stations.length === 1) {
    return values[0] ?? 0;
  }
  const first = stations[0] ?? 0;
  const last = stations[stations.length - 1] ?? 1;
  if (!Number.isFinite(station) || station <= first) return values[0] ?? 0;
  if (station >= last) return values[values.length - 1] ?? 0;

  for (let index = 0; index < stations.length - 1; index += 1) {
    const x0 = stations[index];
    const x1 = stations[index + 1];
    if (x0 === undefined || x1 === undefined) continue;
    if (station >= x0 && station <= x1) {
      const v0 = values[index] ?? 0;
      const v1 = values[index + 1] ?? 0;
      if (Math.abs(x1 - x0) < 1e-15) return v1;
      const t = (station - x0) / (x1 - x0);
      return v0 + t * (v1 - v0);
    }
  }
  return values[values.length - 1] ?? 0;
}

function seriesValues(
  source: FrameStationForces | FrameStationDisplacements,
  key: string,
  count: number,
): number[] {
  const raw = (source as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, index) => {
    const value = raw[index];
    return isFiniteNumber(value) ? value : 0;
  });
}

function safeStations(stations: number[] | undefined, count: number): number[] {
  if (!Array.isArray(stations) || stations.length === 0) {
    if (count === 1) return [0];
    return Array.from({ length: Math.max(count, 2) }, (_, index) =>
      count <= 1 ? 0 : index / (Math.max(count, 2) - 1),
    );
  }
  return stations.map((value) => (isFiniteNumber(value) ? value : 0));
}

/**
 * Series del inspector: las seis acciones internas (ejes locales, en las
 * estaciones exportadas) y los seis movimientos globales, tomados de la curva
 * deformada sin amplificar (Hermite en pórticos, cuerda en celosías).
 */
export function buildFrameChartSeries(
  model: PymasModel,
  result: PatternResultData,
  frameId: string,
): FrameChartSeries[] | null {
  const frameResult = result.frameResults[frameId];
  if (!frameResult) return null;

  const forceStations = safeStations(
    frameResult.internalForces.stations,
    Math.max(
      frameResult.internalForces.fx.length,
      frameResult.internalForces.fy.length,
      frameResult.internalForces.fz.length,
      frameResult.internalForces.mx.length,
      frameResult.internalForces.my.length,
      frameResult.internalForces.mz.length,
      frameResult.internalForces.stations.length,
    ),
  );
  const forceCount = forceStations.length;
  const forceSeries: FrameChartSeries[] = FORCE_COMPONENTS.map((component) => ({
    key: component,
    label: FRAME_CHART_LABELS[component],
    family: FRAME_CHART_FAMILY[component],
    stations: forceStations,
    values: seriesValues(frameResult.internalForces, component, forceCount),
  }));

  let movementSeries: FrameChartSeries[] = [];
  try {
    const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 8 });
    movementSeries = MOVEMENT_COMPONENTS.map((component, index) => {
      const source = index < 3 ? curve.globalDisplacements : curve.globalRotations;
      const axis = index % 3;
      return {
        key: component,
        label: FRAME_CHART_LABELS[component],
        family: FRAME_CHART_FAMILY[component],
        stations: [...curve.stations],
        values: source.map((value) => value[axis] ?? 0),
      };
    });
  } catch {
    movementSeries = [];
  }

  return [...forceSeries, ...movementSeries];
}

export interface FrameForceSummary {
  frameId: string;
  frameName: string;
  materialId: string;
  materialName: string;
  sectionId: string;
  sectionName: string;
  axial: number;
  shearY: number;
  shearZ: number;
  torsion: number;
  momentY: number;
  momentZ: number;
  maxForce: number;
  maxMoment: number;
}

function maxAbs(values: number[]): number {
  let maximum = 0;
  for (const value of values) {
    if (isFiniteNumber(value)) maximum = Math.max(maximum, Math.abs(value));
  }
  return maximum;
}

/** Máximos absolutos por barra, para la tabla de demandas. */
export function summarizeFrameForces(
  model: PymasModel,
  result: PatternResultData,
  frameId: string,
): FrameForceSummary | null {
  const frame = model.frames[frameId];
  const frameResult = result.frameResults[frameId];
  if (!frame || !frameResult) return null;
  const forces = frameResult.internalForces;
  const axial = maxAbs(forces.fx);
  const shearY = maxAbs(forces.fy);
  const shearZ = maxAbs(forces.fz);
  const torsion = maxAbs(forces.mx);
  const momentY = maxAbs(forces.my);
  const momentZ = maxAbs(forces.mz);
  return {
    frameId,
    frameName: frame.name || frame.id,
    materialId: frame.materialId,
    materialName: model.materials[frame.materialId]?.name ?? frame.materialId,
    sectionId: frame.sectionId,
    sectionName: model.sections[frame.sectionId]?.name ?? frame.sectionId,
    axial,
    shearY,
    shearZ,
    torsion,
    momentY,
    momentZ,
    maxForce: Math.max(axial, shearY, shearZ),
    maxMoment: Math.max(torsion, momentY, momentZ),
  };
}

export function frameForceSummaries(
  model: PymasModel,
  result: PatternResultData,
): FrameForceSummary[] {
  const summaries: FrameForceSummary[] = [];
  for (const frameId of model.frameOrder) {
    const summary = summarizeFrameForces(model, result, frameId);
    if (summary) summaries.push(summary);
  }
  return summaries;
}
