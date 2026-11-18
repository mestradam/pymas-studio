import type {
  Displacement6D,
  EnvelopeResult,
  FrameResultData,
  FrameStationDisplacements,
  FrameStationForces,
  LoadCombinationData,
  PatternResultData,
  PymasModel,
  Vector6D,
} from "../types/pymas";

const FALLBACK_STATIONS = [0, 0.25, 0.5, 0.75, 1];

export class MissingPatternResultError extends Error {
  constructor(patternId: string) {
    super(`No existen resultados para el patrón "${patternId}".`);
    this.name = "MissingPatternResultError";
  }
}

export function zeroVector6(): Vector6D {
  return { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
}

export function zeroDisplacement6(): Displacement6D {
  return { ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
}

function addVector(target: Vector6D, source: Vector6D, factor: number): void {
  target.fx += source.fx * factor;
  target.fy += source.fy * factor;
  target.fz += source.fz * factor;
  target.mx += source.mx * factor;
  target.my += source.my * factor;
  target.mz += source.mz * factor;
}

function addDisplacement(target: Displacement6D, source: Displacement6D, factor: number): void {
  target.ux += source.ux * factor;
  target.uy += source.uy * factor;
  target.uz += source.uz * factor;
  target.rx += source.rx * factor;
  target.ry += source.ry * factor;
  target.rz += source.rz * factor;
}

function interpolate(stations: number[], values: number[], x: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1 || stations.length !== values.length) return values[0] ?? 0;
  const first = stations[0] ?? 0;
  const last = stations[stations.length - 1] ?? 1;
  if (x <= first) return values[0] ?? 0;
  if (x >= last) return values[values.length - 1] ?? 0;
  for (let i = 0; i < stations.length - 1; i += 1) {
    const x0 = stations[i];
    const x1 = stations[i + 1];
    if (x0 === undefined || x1 === undefined) continue;
    if (x >= x0 && x <= x1) {
      const v0 = values[i] ?? 0;
      const v1 = values[i + 1] ?? 0;
      if (Math.abs(x1 - x0) < 1e-15) return v1;
      const t = (x - x0) / (x1 - x0);
      return v0 + t * (v1 - v0);
    }
  }
  return values[values.length - 1] ?? 0;
}

function stationsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 1e-12) return false;
  }
  return true;
}

function firstFrameResult(
  results: readonly PatternResultData[],
  frameId: string,
): FrameResultData | undefined {
  for (const result of results) {
    const frame = result.frameResults[frameId];
    if (frame) return frame;
  }
  return undefined;
}

function targetStationsFor(
  results: readonly PatternResultData[],
  frameId: string,
  key: "internalForces" | "internalDisplacements",
): number[] {
  const result = firstFrameResult(results, frameId);
  const stations = result?.[key].stations;
  return stations && stations.length > 0 ? stations : FALLBACK_STATIONS;
}

function emptyForces(stations: number[]): FrameStationForces {
  const n = stations.length;
  return {
    stations: [...stations],
    fx: Array(n).fill(0) as number[],
    fy: Array(n).fill(0) as number[],
    fz: Array(n).fill(0) as number[],
    mx: Array(n).fill(0) as number[],
    my: Array(n).fill(0) as number[],
    mz: Array(n).fill(0) as number[],
    hasExplicitStations: false,
  };
}

function emptyDisplacements(stations: number[]): FrameStationDisplacements {
  const n = stations.length;
  return {
    stations: [...stations],
    ux: Array(n).fill(0) as number[],
    uy: Array(n).fill(0) as number[],
    uz: Array(n).fill(0) as number[],
    rx: Array(n).fill(0) as number[],
    ry: Array(n).fill(0) as number[],
    rz: Array(n).fill(0) as number[],
    hasExplicitStations: false,
  };
}

function addStationSeries(
  target: number[],
  targetStations: number[],
  source: number[],
  sourceStations: number[],
  factor: number,
): void {
  if (target.length === 0) return;
  if (stationsEqual(targetStations, sourceStations)) {
    for (let i = 0; i < target.length; i += 1) {
      target[i] = (target[i] ?? 0) + (source[i] ?? 0) * factor;
    }
    return;
  }
  for (let i = 0; i < target.length; i += 1) {
    const x = targetStations[i] ?? 0;
    target[i] = (target[i] ?? 0) + interpolate(sourceStations, source, x) * factor;
  }
}

function addForces(
  target: FrameStationForces,
  source: FrameStationForces,
  factor: number,
): void {
  addStationSeries(target.fx, target.stations, source.fx, source.stations, factor);
  addStationSeries(target.fy, target.stations, source.fy, source.stations, factor);
  addStationSeries(target.fz, target.stations, source.fz, source.stations, factor);
  addStationSeries(target.mx, target.stations, source.mx, source.stations, factor);
  addStationSeries(target.my, target.stations, source.my, source.stations, factor);
  addStationSeries(target.mz, target.stations, source.mz, source.stations, factor);
}

function addDisplacements(
  target: FrameStationDisplacements,
  source: FrameStationDisplacements,
  factor: number,
): void {
  addStationSeries(target.ux, target.stations, source.ux, source.stations, factor);
  addStationSeries(target.uy, target.stations, source.uy, source.stations, factor);
  addStationSeries(target.uz, target.stations, source.uz, source.stations, factor);
  addStationSeries(target.rx, target.stations, source.rx, source.stations, factor);
  addStationSeries(target.ry, target.stations, source.ry, source.stations, factor);
  addStationSeries(target.rz, target.stations, source.rz, source.stations, factor);
}

function collectPatternResults(
  model: PymasModel,
  factors: Record<string, number>,
  options: SuperpositionOptions,
): Array<{ patternId: string; factor: number; result: PatternResultData }> {
  const out: Array<{ patternId: string; factor: number; result: PatternResultData }> = [];
  for (const [patternId, factor] of Object.entries(factors)) {
    if (!Number.isFinite(factor)) continue;
    const result = model.results[patternId];
    if (!result) {
      if (options.allowMissing) continue;
      throw new MissingPatternResultError(patternId);
    }
    if (factor === 0) continue;
    out.push({ patternId, factor, result });
  }
  return out;
}

export interface SuperpositionOptions {
  /** Si true, ignora patrones sin resultados en vez de lanzar un error. */
  allowMissing?: boolean;
}

/** Combinación lineal tensorial R_C = Σ α_k R_k (sección 5.3 del plano). */
export function linearCombination(
  model: PymasModel,
  factors: Record<string, number>,
  options: SuperpositionOptions = {},
): PatternResultData {
  const contributions = collectPatternResults(model, factors, options);
  const results = contributions.map((c) => c.result);

  const nodalDisplacements: Record<string, Displacement6D> = {};
  const reactions: Record<string, Vector6D> = {};
  for (const nodeId of model.nodeOrder) {
    const disp = zeroDisplacement6();
    const reaction = zeroVector6();
    for (const { factor, result } of contributions) {
      const sourceDisp = result.nodalDisplacements[nodeId];
      if (sourceDisp) addDisplacement(disp, sourceDisp, factor);
      const sourceReaction = result.reactions[nodeId];
      if (sourceReaction) addVector(reaction, sourceReaction, factor);
    }
    nodalDisplacements[nodeId] = disp;
    reactions[nodeId] = reaction;
  }

  const frameResults: Record<string, FrameResultData> = {};
  for (const frameId of model.frameOrder) {
    const forceStations = targetStationsFor(results, frameId, "internalForces");
    const dispStations = targetStationsFor(results, frameId, "internalDisplacements");
    const forces = emptyForces(forceStations);
    const displacements = emptyDisplacements(dispStations);
    const endActions = { i: zeroVector6(), j: zeroVector6() };

    for (const { factor, result } of contributions) {
      const frame = result.frameResults[frameId];
      if (!frame) continue;
      addVector(endActions.i, frame.endActions.i, factor);
      addVector(endActions.j, frame.endActions.j, factor);
      addForces(forces, frame.internalForces, factor);
      addDisplacements(displacements, frame.internalDisplacements, factor);
    }

    frameResults[frameId] = {
      endActions,
      internalForces: forces,
      internalDisplacements: displacements,
    };
  }

  // Conserva resultados de barras que existan en los patrones aunque no estén
  // declaradas en el modelo (exportadores antiguos).
  for (const { result } of contributions) {
    for (const frameId of Object.keys(result.frameResults)) {
      if (frameResults[frameId]) continue;
      const frame = result.frameResults[frameId];
      if (!frame) continue;
      frameResults[frameId] = {
        endActions: { i: { ...frame.endActions.i }, j: { ...frame.endActions.j } },
        internalForces: {
          ...frame.internalForces,
          stations: [...frame.internalForces.stations],
          fx: [...frame.internalForces.fx],
          fy: [...frame.internalForces.fy],
          fz: [...frame.internalForces.fz],
          mx: [...frame.internalForces.mx],
          my: [...frame.internalForces.my],
          mz: [...frame.internalForces.mz],
        },
        internalDisplacements: {
          ...frame.internalDisplacements,
          stations: [...frame.internalDisplacements.stations],
          ux: [...frame.internalDisplacements.ux],
          uy: [...frame.internalDisplacements.uy],
          uz: [...frame.internalDisplacements.uz],
          rx: [...frame.internalDisplacements.rx],
          ry: [...frame.internalDisplacements.ry],
          rz: [...frame.internalDisplacements.rz],
        },
      };
    }
  }

  return { nodalDisplacements, reactions, frameResults };
}

function minMax(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  let min = values[0] ?? 0;
  let max = values[0] ?? 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

function envelopeSeries(
  contributions: Array<{ factor: number; result: PatternResultData }>,
  frameId: string,
  key: "internalForces" | "internalDisplacements",
  component: string,
  targetStations: number[],
): { min: number[]; max: number[] } {
  const minValues = Array(targetStations.length).fill(0) as number[];
  const maxValues = Array(targetStations.length).fill(0) as number[];
  for (let i = 0; i < targetStations.length; i += 1) {
    const x = targetStations[i] ?? 0;
    const samples: number[] = [];
    for (const { factor, result } of contributions) {
      const frame = result.frameResults[frameId];
      if (!frame) {
        samples.push(0);
        continue;
      }
      const series = frame[key];
      const values = (series as unknown as Record<string, unknown>)[component];
      const stations = series.stations;
      if (Array.isArray(values)) {
        samples.push(interpolate(stations, values as number[], x) * factor);
      } else {
        samples.push(0);
      }
    }
    const [min, max] = minMax(samples);
    minValues[i] = min;
    maxValues[i] = max;
  }
  return { min: minValues, max: maxValues };
}

/** Envolvente min/max por componente y estación (sección 5.3 del plano). */
export function envelopeCombination(
  model: PymasModel,
  factors: Record<string, number>,
  options: SuperpositionOptions = {},
): EnvelopeResult {
  const contributions = collectPatternResults(model, factors, options);
  const results = contributions.map((c) => c.result);
  const minResult: PatternResultData = {
    nodalDisplacements: {},
    reactions: {},
    frameResults: {},
  };
  const maxResult: PatternResultData = {
    nodalDisplacements: {},
    reactions: {},
    frameResults: {},
  };

  for (const nodeId of model.nodeOrder) {
    const dispSamples = {
      ux: [] as number[],
      uy: [] as number[],
      uz: [] as number[],
      rx: [] as number[],
      ry: [] as number[],
      rz: [] as number[],
    };
    const reactionSamples = {
      fx: [] as number[],
      fy: [] as number[],
      fz: [] as number[],
      mx: [] as number[],
      my: [] as number[],
      mz: [] as number[],
    };
    for (const { factor, result } of contributions) {
      const disp = result.nodalDisplacements[nodeId] ?? zeroDisplacement6();
      dispSamples.ux.push(disp.ux * factor);
      dispSamples.uy.push(disp.uy * factor);
      dispSamples.uz.push(disp.uz * factor);
      dispSamples.rx.push(disp.rx * factor);
      dispSamples.ry.push(disp.ry * factor);
      dispSamples.rz.push(disp.rz * factor);
      const reaction = result.reactions[nodeId] ?? zeroVector6();
      reactionSamples.fx.push(reaction.fx * factor);
      reactionSamples.fy.push(reaction.fy * factor);
      reactionSamples.fz.push(reaction.fz * factor);
      reactionSamples.mx.push(reaction.mx * factor);
      reactionSamples.my.push(reaction.my * factor);
      reactionSamples.mz.push(reaction.mz * factor);
    }
    const minDisp = zeroDisplacement6();
    const maxDisp = zeroDisplacement6();
    const minReaction = zeroVector6();
    const maxReaction = zeroVector6();
    for (const key of Object.keys(minDisp) as Array<keyof Displacement6D>) {
      const [min, max] = minMax(dispSamples[key]);
      minDisp[key] = min;
      maxDisp[key] = max;
    }
    for (const key of Object.keys(minReaction) as Array<keyof Vector6D>) {
      const [min, max] = minMax(reactionSamples[key]);
      minReaction[key] = min;
      maxReaction[key] = max;
    }
    minResult.nodalDisplacements[nodeId] = minDisp;
    maxResult.nodalDisplacements[nodeId] = maxDisp;
    minResult.reactions[nodeId] = minReaction;
    maxResult.reactions[nodeId] = maxReaction;
  }

  const forceComponents = ["fx", "fy", "fz", "mx", "my", "mz"] as const;
  const dispComponents = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;

  for (const frameId of model.frameOrder) {
    const forceStations = targetStationsFor(results, frameId, "internalForces");
    const dispStations = targetStationsFor(results, frameId, "internalDisplacements");
    const minForces = emptyForces(forceStations);
    const maxForces = emptyForces(forceStations);
    const minDisp = emptyDisplacements(dispStations);
    const maxDisp = emptyDisplacements(dispStations);

    for (const component of forceComponents) {
      const { min, max } = envelopeSeries(
        contributions,
        frameId,
        "internalForces",
        component,
        forceStations,
      );
      minForces[component] = min;
      maxForces[component] = max;
    }
    for (const component of dispComponents) {
      const { min, max } = envelopeSeries(
        contributions,
        frameId,
        "internalDisplacements",
        component,
        dispStations,
      );
      minDisp[component] = min;
      maxDisp[component] = max;
    }

    const minEndI = zeroVector6();
    const minEndJ = zeroVector6();
    const maxEndI = zeroVector6();
    const maxEndJ = zeroVector6();
    for (const key of Object.keys(minEndI) as Array<keyof Vector6D>) {
      const iSamples: number[] = [];
      const jSamples: number[] = [];
      for (const { factor, result } of contributions) {
        const frame = result.frameResults[frameId];
        iSamples.push((frame?.endActions.i[key] ?? 0) * factor);
        jSamples.push((frame?.endActions.j[key] ?? 0) * factor);
      }
      const [iMin, iMax] = minMax(iSamples);
      const [jMin, jMax] = minMax(jSamples);
      minEndI[key] = iMin;
      maxEndI[key] = iMax;
      minEndJ[key] = jMin;
      maxEndJ[key] = jMax;
    }

    minResult.frameResults[frameId] = {
      endActions: { i: minEndI, j: minEndJ },
      internalForces: minForces,
      internalDisplacements: minDisp,
    };
    maxResult.frameResults[frameId] = {
      endActions: { i: maxEndI, j: maxEndJ },
      internalForces: maxForces,
      internalDisplacements: maxDisp,
    };
  }

  return { min: minResult, max: maxResult };
}

export function combineLoadCombination(
  model: PymasModel,
  combination: LoadCombinationData,
  options: SuperpositionOptions = {},
): PatternResultData | EnvelopeResult {
  if (combination.type === "envelope") {
    return envelopeCombination(model, combination.factors, options);
  }
  return linearCombination(model, combination.factors, options);
}

/**
 * Calcula en vivo todas las combinaciones lineales solicitadas a partir de los
 * resultados base de los patrones. Nunca consulta `model.results[combinación]`:
 * si el exportador incluye combinaciones precalculadas, se ignoran.
 *
 * Las combinaciones de tipo `envelope` se resuelven por separado mediante
 * `envelopeCombination` y no forman parte de este mapa de resultados lineales.
 */
export function computeLinearCombinations(
  model: PymasModel,
  combinationIds: readonly string[] = model.loadCombinationOrder,
  options: SuperpositionOptions = {},
): Record<string, PatternResultData> {
  const out: Record<string, PatternResultData> = {};
  for (const combinationId of combinationIds) {
    const combination = model.loadCombinations[combinationId];
    if (!combination || combination.type === "envelope") continue;
    out[combinationId] = linearCombination(model, combination.factors, options);
  }
  return out;
}

function emptyPatternResult(model: PymasModel): PatternResultData {
  const nodalDisplacements: Record<string, Displacement6D> = {};
  const reactions: Record<string, Vector6D> = {};
  for (const nodeId of model.nodeOrder) {
    nodalDisplacements[nodeId] = zeroDisplacement6();
    reactions[nodeId] = zeroVector6();
  }
  const frameResults: Record<string, FrameResultData> = {};
  for (const frameId of model.frameOrder) {
    frameResults[frameId] = {
      endActions: { i: zeroVector6(), j: zeroVector6() },
      internalForces: emptyForces([...FALLBACK_STATIONS]),
      internalDisplacements: emptyDisplacements([...FALLBACK_STATIONS]),
    };
  }
  return { nodalDisplacements, reactions, frameResults };
}

/**
 * Envolvente min/max de un conjunto arbitrario de resultados completos.
 * Se usa para ENV_MAX / ENV_MIN sobre combinaciones activas, donde cada
 * combinación ya es un caso de carga completo.
 */
export function envelopeResults(
  model: PymasModel,
  results: readonly PatternResultData[],
): EnvelopeResult {
  if (results.length === 0) {
    const zero = emptyPatternResult(model);
    return { min: zero, max: zero };
  }

  const minResult = emptyPatternResult(model);
  const maxResult = emptyPatternResult(model);

  for (const nodeId of model.nodeOrder) {
    const dispSamples = {
      ux: [] as number[],
      uy: [] as number[],
      uz: [] as number[],
      rx: [] as number[],
      ry: [] as number[],
      rz: [] as number[],
    };
    const reactionSamples = {
      fx: [] as number[],
      fy: [] as number[],
      fz: [] as number[],
      mx: [] as number[],
      my: [] as number[],
      mz: [] as number[],
    };
    for (const result of results) {
      const disp = result.nodalDisplacements[nodeId] ?? zeroDisplacement6();
      dispSamples.ux.push(disp.ux);
      dispSamples.uy.push(disp.uy);
      dispSamples.uz.push(disp.uz);
      dispSamples.rx.push(disp.rx);
      dispSamples.ry.push(disp.ry);
      dispSamples.rz.push(disp.rz);
      const reaction = result.reactions[nodeId] ?? zeroVector6();
      reactionSamples.fx.push(reaction.fx);
      reactionSamples.fy.push(reaction.fy);
      reactionSamples.fz.push(reaction.fz);
      reactionSamples.mx.push(reaction.mx);
      reactionSamples.my.push(reaction.my);
      reactionSamples.mz.push(reaction.mz);
    }

    const minDisp = minResult.nodalDisplacements[nodeId] ?? zeroDisplacement6();
    const maxDisp = maxResult.nodalDisplacements[nodeId] ?? zeroDisplacement6();
    const minReaction = minResult.reactions[nodeId] ?? zeroVector6();
    const maxReaction = maxResult.reactions[nodeId] ?? zeroVector6();
    for (const key of Object.keys(minDisp) as Array<keyof Displacement6D>) {
      const [min, max] = minMax(dispSamples[key]);
      minDisp[key] = min;
      maxDisp[key] = max;
    }
    for (const key of Object.keys(minReaction) as Array<keyof Vector6D>) {
      const [min, max] = minMax(reactionSamples[key]);
      minReaction[key] = min;
      maxReaction[key] = max;
    }
    minResult.nodalDisplacements[nodeId] = minDisp;
    maxResult.nodalDisplacements[nodeId] = maxDisp;
    minResult.reactions[nodeId] = minReaction;
    maxResult.reactions[nodeId] = maxReaction;
  }

  const forceComponents = ["fx", "fy", "fz", "mx", "my", "mz"] as const;
  const dispComponents = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;
  const frameIds = new Set<string>(model.frameOrder);
  for (const result of results) {
    for (const frameId of Object.keys(result.frameResults)) frameIds.add(frameId);
  }

  for (const frameId of frameIds) {
    const forceStations = targetStationsFor(results, frameId, "internalForces");
    const dispStations = targetStationsFor(results, frameId, "internalDisplacements");
    const minForces = emptyForces(forceStations);
    const maxForces = emptyForces(forceStations);
    const minDisp = emptyDisplacements(dispStations);
    const maxDisp = emptyDisplacements(dispStations);

    for (const component of forceComponents) {
      const samples: number[][] = forceStations.map(() => []);
      for (const result of results) {
        const frame = result.frameResults[frameId];
        if (!frame) {
          for (const values of samples) values.push(0);
          continue;
        }
        for (let index = 0; index < forceStations.length; index += 1) {
          samples[index]?.push(
            interpolate(
              frame.internalForces.stations,
              frame.internalForces[component],
              forceStations[index] ?? 0,
            ),
          );
        }
      }
      minForces[component] = samples.map((values) => minMax(values)[0]);
      maxForces[component] = samples.map((values) => minMax(values)[1]);
    }

    for (const component of dispComponents) {
      const samples: number[][] = dispStations.map(() => []);
      for (const result of results) {
        const frame = result.frameResults[frameId];
        if (!frame) {
          for (const values of samples) values.push(0);
          continue;
        }
        for (let index = 0; index < dispStations.length; index += 1) {
          samples[index]?.push(
            interpolate(
              frame.internalDisplacements.stations,
              frame.internalDisplacements[component],
              dispStations[index] ?? 0,
            ),
          );
        }
      }
      minDisp[component] = samples.map((values) => minMax(values)[0]);
      maxDisp[component] = samples.map((values) => minMax(values)[1]);
    }

    const minEndI = zeroVector6();
    const minEndJ = zeroVector6();
    const maxEndI = zeroVector6();
    const maxEndJ = zeroVector6();
    for (const key of Object.keys(minEndI) as Array<keyof Vector6D>) {
      const iSamples: number[] = [];
      const jSamples: number[] = [];
      for (const result of results) {
        const frame = result.frameResults[frameId];
        iSamples.push(frame?.endActions.i[key] ?? 0);
        jSamples.push(frame?.endActions.j[key] ?? 0);
      }
      const [iMin, iMax] = minMax(iSamples);
      const [jMin, jMax] = minMax(jSamples);
      minEndI[key] = iMin;
      maxEndI[key] = iMax;
      minEndJ[key] = jMin;
      maxEndJ[key] = jMax;
    }

    minResult.frameResults[frameId] = {
      endActions: { i: minEndI, j: minEndJ },
      internalForces: minForces,
      internalDisplacements: minDisp,
    };
    maxResult.frameResults[frameId] = {
      endActions: { i: maxEndI, j: maxEndJ },
      internalForces: maxForces,
      internalDisplacements: maxDisp,
    };
  }

  return { min: minResult, max: maxResult };
}

/**
 * ENV_MAX / ENV_MIN sobre las combinaciones activas. Cada combinación se
 * recalcula en vivo desde los patrones base; las combinaciones de tipo
 * `envelope` aportan sus dos resultados extremos.
 */
export function envelopeAcrossCombinations(
  model: PymasModel,
  combinationIds: readonly string[] = model.loadCombinationOrder,
  options: SuperpositionOptions = {},
): EnvelopeResult {
  const results: PatternResultData[] = [];
  for (const combinationId of combinationIds) {
    const combination = model.loadCombinations[combinationId];
    if (!combination) continue;
    const computed = combineLoadCombination(model, combination, options);
    if ("min" in computed) {
      results.push(computed.min, computed.max);
    } else {
      results.push(computed);
    }
  }
  return envelopeResults(model, results);
}


export function getCombinationById(
  model: PymasModel,
  combinationId: string,
): LoadCombinationData {
  const combination = model.loadCombinations[combinationId];
  if (!combination) {
    throw new Error(`No existe la combinación "${combinationId}".`);
  }
  return combination;
}

export function computeCombination(
  model: PymasModel,
  combinationId: string,
  options: SuperpositionOptions = {},
): PatternResultData | EnvelopeResult {
  return combineLoadCombination(model, getCombinationById(model, combinationId), options);
}

export function hasStoredResult(model: PymasModel, resultId: string): boolean {
  return model.results[resultId] !== undefined;
}
