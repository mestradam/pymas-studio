import type {
  FrameResultData,
  PatternResultData,
  PymasModel,
} from "../types/pymas";
import { buildDeformedFrame, deformationHeatRange } from "./deformation";
import {
  heatmapRange,
  isForceHeatScalar,
  type HeatmapScalar,
} from "./heatmap";
import { DEFAULT_UP_AXIS, type UpAxis } from "./upAxis";

/**
 * Mapa de calor de resultados sobre la estructura.
 *
 * Unifica dos fuentes que hasta ahora vivían separadas:
 *  - los desplazamientos de la deformada (globales) y la deriva, calculados con
 *    el motor de deformación;
 *  - los seis esfuerzos internos locales exportados por pymas (`fx`…`mz`).
 *
 * Los esfuerzos se leen en las estaciones exportadas, sin densificar, porque el
 * diagrama clásico ya es lineal entre estaciones. La escena y la leyenda usan
 * el mismo rango para que los colores coincidan exactamente.
 */

export interface StationHeatSeries {
  /** Estaciones normalizadas 0..1. */
  stations: number[];
  values: number[];
}

function normalizedStations(
  stations: number[] | undefined,
  count: number,
): number[] {
  if (
    Array.isArray(stations) &&
    stations.length === count &&
    stations.every((value) => Number.isFinite(value))
  ) {
    return [...stations];
  }
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) => index / (count - 1));
}

/** Serie de un esfuerzo interno en las estaciones exportadas de la barra. */
export function frameForceHeatSeries(
  frameResult: FrameResultData,
  scalar: HeatmapScalar,
): StationHeatSeries {
  if (!isForceHeatScalar(scalar)) return { stations: [], values: [] };
  const values = frameResult.internalForces[scalar];
  const stations = normalizedStations(
    frameResult.internalForces.stations,
    values.length,
  );
  return { stations, values: [...values] };
}

/**
 * Estaciones y valores para colorear una barra.
 *
 * - Esfuerzos: estaciones exportadas de `internal_forces`.
 * - Deformada: la misma curva densificada que dibuja `DeformedStructure`.
 *
 * Devuelve `null` cuando la barra no tiene resultados, para que la escena caiga
 * al color plano sin inventar valores.
 */
export function frameHeatStations(
  model: PymasModel,
  result: PatternResultData,
  frameId: string,
  scalar: HeatmapScalar,
  options: { subdivisions?: number; upAxis?: UpAxis } = {},
): StationHeatSeries | null {
  const frameResult = result.frameResults[frameId];
  if (!frameResult) return null;

  if (isForceHeatScalar(scalar)) {
    return frameForceHeatSeries(frameResult, scalar);
  }

  const curve = buildDeformedFrame(model, result, frameId, {
    subdivisions: options.subdivisions ?? 6,
    upAxis: options.upAxis ?? DEFAULT_UP_AXIS,
  });
  return {
    stations: [...curve.stations],
    values: [...curve.heat[scalar]],
  };
}

/**
 * Rango global del mapa de calor. Para esfuerzos recorre todas las barras; para
 * la deformada delega en `deformationHeatRange` para no duplicar la lógica de
 * deriva y cerchas.
 */
export function resultHeatRange(
  model: PymasModel,
  result: PatternResultData,
  scalar: HeatmapScalar,
  upAxis: UpAxis = DEFAULT_UP_AXIS,
): { min: number; max: number } {
  if (!isForceHeatScalar(scalar)) {
    return deformationHeatRange(model, result, scalar, upAxis);
  }

  const values: number[] = [];
  for (const frameId of model.frameOrder) {
    const frameResult = result.frameResults[frameId];
    if (!frameResult) continue;
    values.push(...frameResult.internalForces[scalar]);
  }
  return heatmapRange(values);
}
