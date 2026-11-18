import type { PatternResultData, PymasModel } from "../types/pymas";
import { isFiniteNumber } from "./geometry";
import { frameForceSummaries, type FrameForceSummary } from "./inspection";

/**
 * Motor puro del comparador de modelos A/B.
 *
 * Todas las magnitudes son las mismas que usan el inspector y las tablas de la
 * fase anterior: desplazamiento nodal `hypot(ux,uy,uz)`, resultante de reacción
 * y máximos absolutos por barra. Los porcentajes se calculan respecto del valor
 * absoluto del modelo base A; si A es nulo y B no cambia se devuelve 0, y si A
 * es nulo pero B no, se devuelve `null` (sin base porcentual).
 */

export interface ComparisonValue {
  a: number;
  b: number;
  delta: number;
  percent: number | null;
}

export interface MagnitudePeak {
  id: string;
  label: string;
  value: number;
}

export interface BaseReactionSummary {
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
  /** Cortante basal horizontal: |(ΣFx, ΣFy)|. */
  shear: number;
  /** Resultante vertical absoluta: |ΣFz|. */
  axial: number;
  /** Momento basal resultante: |(ΣMx, ΣMy, ΣMz)|. */
  moment: number;
}

export interface NodeDisplacementDiff {
  nodeId: string;
  label: string;
  a: number;
  b: number;
  delta: number;
  percent: number | null;
}

export interface ReactionDiff {
  supportId: string;
  nodeId: string;
  label: string;
  kind: string;
  force: ComparisonValue;
  moment: ComparisonValue;
}

export interface FrameDemandDiff {
  frameId: string;
  label: string;
  materialId: string;
  materialName: string;
  sectionId: string;
  sectionName: string;
  axial: ComparisonValue;
  shearY: ComparisonValue;
  shearZ: ComparisonValue;
  torsion: ComparisonValue;
  momentY: ComparisonValue;
  momentZ: ComparisonValue;
  maxForce: ComparisonValue;
  maxMoment: ComparisonValue;
}

export interface ComparisonSummary {
  nodeCount: number;
  reactionCount: number;
  frameCount: number;
  maxDisplacement: ComparisonValue;
  maxDisplacementNode: { a: MagnitudePeak | null; b: MagnitudePeak | null };
  baseShear: ComparisonValue;
  baseAxial: ComparisonValue;
  baseMoment: ComparisonValue;
  maxReactionForce: ComparisonValue;
  maxReactionMoment: ComparisonValue;
  maxFrameForce: ComparisonValue;
  maxFrameMoment: ComparisonValue;
  frameIncreaseCount: number;
  frameDecreaseCount: number;
  frameEqualCount: number;
}

export interface ModelComparison {
  summary: ComparisonSummary;
  baseReactions: { a: BaseReactionSummary; b: BaseReactionSummary };
  nodes: NodeDisplacementDiff[];
  reactions: ReactionDiff[];
  frames: FrameDemandDiff[];
}

export function percentChange(base: number, changed: number): number | null {
  if (!isFiniteNumber(base) || !isFiniteNumber(changed)) return null;
  const delta = changed - base;
  if (Math.abs(base) <= 1e-12) {
    return Math.abs(delta) <= 1e-12 ? 0 : null;
  }
  return (delta / Math.abs(base)) * 100;
}

export function compareValue(a: number, b: number): ComparisonValue {
  const safeA = isFiniteNumber(a) ? a : 0;
  const safeB = isFiniteNumber(b) ? b : 0;
  return {
    a: safeA,
    b: safeB,
    delta: safeB - safeA,
    percent: percentChange(safeA, safeB),
  };
}

function magnitude(values: number[]): number {
  return Math.hypot(...values.map((value) => (isFiniteNumber(value) ? value : 0)));
}

export function nodeDisplacementMagnitude(
  result: PatternResultData,
  nodeId: string,
): number | null {
  const displacement = result.nodalDisplacements[nodeId];
  if (!displacement) return null;
  return magnitude([displacement.ux, displacement.uy, displacement.uz]);
}

export function summarizeBaseReactions(result: PatternResultData): BaseReactionSummary {
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const reaction of Object.values(result.reactions)) {
    fx += isFiniteNumber(reaction.fx) ? reaction.fx : 0;
    fy += isFiniteNumber(reaction.fy) ? reaction.fy : 0;
    fz += isFiniteNumber(reaction.fz) ? reaction.fz : 0;
    mx += isFiniteNumber(reaction.mx) ? reaction.mx : 0;
    my += isFiniteNumber(reaction.my) ? reaction.my : 0;
    mz += isFiniteNumber(reaction.mz) ? reaction.mz : 0;
  }
  return {
    fx,
    fy,
    fz,
    mx,
    my,
    mz,
    shear: Math.hypot(fx, fy),
    axial: Math.abs(fz),
    moment: Math.hypot(mx, my, mz),
  };
}

function frameMap(summaries: FrameForceSummary[]): Map<string, FrameForceSummary> {
  return new Map(summaries.map((summary) => [summary.frameId, summary]));
}

function peakOf(
  entries: Array<{ id: string; label: string; value: number }>,
): MagnitudePeak | null {
  let best: MagnitudePeak | null = null;
  for (const entry of entries) {
    if (!best || entry.value > best.value) best = entry;
  }
  return best;
}

function reactionForce(result: PatternResultData, nodeId: string): number | null {
  const reaction = result.reactions[nodeId];
  if (!reaction) return null;
  return magnitude([reaction.fx, reaction.fy, reaction.fz]);
}

function reactionMoment(result: PatternResultData, nodeId: string): number | null {
  const reaction = result.reactions[nodeId];
  if (!reaction) return null;
  return magnitude([reaction.mx, reaction.my, reaction.mz]);
}

/** Compara dos modelos/resultados ya resueltos para el mismo caso activo. */
export function compareModels(
  modelA: PymasModel,
  resultA: PatternResultData,
  modelB: PymasModel,
  resultB: PatternResultData,
): ModelComparison {
  const nodes: NodeDisplacementDiff[] = [];
  const nodePeaksA: Array<{ id: string; label: string; value: number }> = [];
  const nodePeaksB: Array<{ id: string; label: string; value: number }> = [];

  const nodeIds = new Set([
    ...Object.keys(resultA.nodalDisplacements),
    ...Object.keys(resultB.nodalDisplacements),
  ]);
  for (const nodeId of nodeIds) {
    const valueA = nodeDisplacementMagnitude(resultA, nodeId);
    const valueB = nodeDisplacementMagnitude(resultB, nodeId);
    if (valueA === null || valueB === null) continue;
    const label = modelA.nodes[nodeId]?.name || nodeId;
    const entry: NodeDisplacementDiff = {
      nodeId,
      label,
      a: valueA,
      b: valueB,
      delta: valueB - valueA,
      percent: percentChange(valueA, valueB),
    };
    nodes.push(entry);
    nodePeaksA.push({ id: nodeId, label, value: valueA });
    nodePeaksB.push({ id: nodeId, label, value: valueB });
  }
  nodes.sort((a, b) => b.a - a.a);

  const reactions: ReactionDiff[] = [];
  let maxReactionForceA = 0;
  let maxReactionForceB = 0;
  let maxReactionMomentA = 0;
  let maxReactionMomentB = 0;
  for (const support of Object.values(modelA.supports)) {
    const nodeB = modelB.supports[support.node];
    if (!nodeB) continue;
    const forceA = reactionForce(resultA, support.node);
    const forceB = reactionForce(resultB, support.node);
    const momentA = reactionMoment(resultA, support.node);
    const momentB = reactionMoment(resultB, support.node);
    if (forceA === null || forceB === null || momentA === null || momentB === null) {
      continue;
    }
    maxReactionForceA = Math.max(maxReactionForceA, forceA);
    maxReactionForceB = Math.max(maxReactionForceB, forceB);
    maxReactionMomentA = Math.max(maxReactionMomentA, momentA);
    maxReactionMomentB = Math.max(maxReactionMomentB, momentB);
    reactions.push({
      supportId: support.id,
      nodeId: support.node,
      label: modelA.nodes[support.node]?.name || support.node,
      kind: support.kind,
      force: compareValue(forceA, forceB),
      moment: compareValue(momentA, momentB),
    });
  }

  const framesA = frameMap(frameForceSummaries(modelA, resultA));
  const framesB = frameMap(frameForceSummaries(modelB, resultB));
  const frames: FrameDemandDiff[] = [];
  let maxFrameForceA = 0;
  let maxFrameForceB = 0;
  let maxFrameMomentA = 0;
  let maxFrameMomentB = 0;
  let increaseCount = 0;
  let decreaseCount = 0;
  let equalCount = 0;

  for (const frameId of modelA.frameOrder) {
    const summaryA = framesA.get(frameId);
    const summaryB = framesB.get(frameId);
    if (!summaryA || !summaryB) continue;
    const entry: FrameDemandDiff = {
      frameId,
      label: summaryA.frameName,
      materialId: summaryA.materialId,
      materialName: summaryA.materialName,
      sectionId: summaryA.sectionId,
      sectionName: summaryA.sectionName,
      axial: compareValue(summaryA.axial, summaryB.axial),
      shearY: compareValue(summaryA.shearY, summaryB.shearY),
      shearZ: compareValue(summaryA.shearZ, summaryB.shearZ),
      torsion: compareValue(summaryA.torsion, summaryB.torsion),
      momentY: compareValue(summaryA.momentY, summaryB.momentY),
      momentZ: compareValue(summaryA.momentZ, summaryB.momentZ),
      maxForce: compareValue(summaryA.maxForce, summaryB.maxForce),
      maxMoment: compareValue(summaryA.maxMoment, summaryB.maxMoment),
    };
    frames.push(entry);
    maxFrameForceA = Math.max(maxFrameForceA, summaryA.maxForce);
    maxFrameForceB = Math.max(maxFrameForceB, summaryB.maxForce);
    maxFrameMomentA = Math.max(maxFrameMomentA, summaryA.maxMoment);
    maxFrameMomentB = Math.max(maxFrameMomentB, summaryB.maxMoment);
    const percent = frameDemandPercent(entry);
    if (percent === null || Math.abs(percent) <= 1e-9) equalCount += 1;
    else if (percent > 0) increaseCount += 1;
    else decreaseCount += 1;
  }
  frames.sort((a, b) => Math.abs(b.maxForce.percent ?? 0) - Math.abs(a.maxForce.percent ?? 0));

  const peakA = peakOf(nodePeaksA);
  const peakB = peakOf(nodePeaksB);
  const baseA = summarizeBaseReactions(resultA);
  const baseB = summarizeBaseReactions(resultB);

  return {
    summary: {
      nodeCount: nodes.length,
      reactionCount: reactions.length,
      frameCount: frames.length,
      maxDisplacement: compareValue(peakA?.value ?? 0, peakB?.value ?? 0),
      maxDisplacementNode: { a: peakA, b: peakB },
      baseShear: compareValue(baseA.shear, baseB.shear),
      baseAxial: compareValue(baseA.axial, baseB.axial),
      baseMoment: compareValue(baseA.moment, baseB.moment),
      maxReactionForce: compareValue(maxReactionForceA, maxReactionForceB),
      maxReactionMoment: compareValue(maxReactionMomentA, maxReactionMomentB),
      maxFrameForce: compareValue(maxFrameForceA, maxFrameForceB),
      maxFrameMoment: compareValue(maxFrameMomentA, maxFrameMomentB),
      frameIncreaseCount: increaseCount,
      frameDecreaseCount: decreaseCount,
      frameEqualCount: equalCount,
    },
    baseReactions: { a: baseA, b: baseB },
    nodes,
    reactions,
    frames,
  };
}

/** Porcentaje de demanda usado en el mapa de calor de barras. */
export function frameDemandPercent(diff: FrameDemandDiff): number | null {
  const candidates = [diff.maxForce.percent, diff.maxMoment.percent].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, value) =>
    Math.abs(value) > Math.abs(best) ? value : best,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixHex(from: string, to: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const a = parse(from);
  const b = parse(to);
  const channel = (index: number) => {
    const value = Math.round(
      (a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * t,
    );
    return value.toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

const NEUTRAL_COLOR = "#64748b";
const INCREASE_COLOR = "#ef4444";
const DECREASE_COLOR = "#22c55e";

/**
 * Verde = demanda reducida, gris = sin cambio, rojo = demanda aumentada.
 * El porcentaje se satura a ±`maxPercent` para que los casos extremos no
 * aplasten visualmente el resto del modelo.
 */
export function demandColor(percent: number | null, maxPercent = 50): string {
  if (percent === null || !Number.isFinite(percent)) return NEUTRAL_COLOR;
  const limit = Math.max(maxPercent, 1);
  const t = clamp(percent / limit, -1, 1);
  if (Math.abs(t) <= 1e-9) return NEUTRAL_COLOR;
  return t > 0
    ? mixHex(NEUTRAL_COLOR, INCREASE_COLOR, t)
    : mixHex(NEUTRAL_COLOR, DECREASE_COLOR, -t);
}

export function comparisonFrameColorMap(
  comparison: ModelComparison | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!comparison) return map;
  for (const frame of comparison.frames) {
    map.set(frame.frameId, demandColor(frameDemandPercent(frame)));
  }
  return map;
}
