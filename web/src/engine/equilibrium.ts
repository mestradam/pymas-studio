import type {
  LoadCombinationData,
  LoadPatternData,
  PatternResultData,
  PymasModel,
  Vector6D,
} from "../types/pymas";
import {
  add,
  cross,
  framePositions,
  midpoint,
  nodePosition,
  projectLoadToGlobal,
  scale,
  type Vec3,
} from "./geometry";
import { linearCombination } from "./superposition";

export interface AppliedLoadSummary {
  /** Fuerza total aplicada (nudos + distribuidas). */
  force: Vec3;
  /** Momento total respecto al origen global (incluye r × F). */
  moment: Vec3;
  nodalForce: Vec3;
  nodalMomentAboutOrigin: Vec3;
  distributedForce: Vec3;
  distributedMomentAboutOrigin: Vec3;
  magnitude: number;
}

export interface NodeLoadBalance {
  appliedForce: Vec3;
  appliedMoment: Vec3;
  reactionForce: Vec3;
  reactionMoment: Vec3;
}

export interface EquilibriumSummary {
  patternId: string;
  applied: {
    force: Vec3;
    moment: Vec3;
  };
  reactions: {
    force: Vec3;
    moment: Vec3;
  };
  residual: {
    force: Vec3;
    moment: Vec3;
  };
  appliedForceNorm: number;
  reactionForceNorm: number;
  appliedMomentNorm: number;
  reactionMomentNorm: number;
  residualForceNorm: number;
  residualMomentNorm: number;
  relativeForceResidual: number;
  relativeMomentResidual: number;
  forceTolerance: number;
  momentTolerance: number;
  balanced: boolean;
  byNode: Record<string, NodeLoadBalance>;
}

const ZERO: Vec3 = [0, 0, 0];

function vector6ToForce(v: Vector6D): Vec3 {
  return [v.fx, v.fy, v.fz];
}

function vector6ToMoment(v: Vector6D): Vec3 {
  return [v.mx, v.my, v.mz];
}

function norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function ensureNode(byNode: Record<string, NodeLoadBalance>, nodeId: string): NodeLoadBalance {
  const existing = byNode[nodeId];
  if (existing) return existing;
  const created: NodeLoadBalance = {
    appliedForce: [...ZERO],
    appliedMoment: [...ZERO],
    reactionForce: [...ZERO],
    reactionMoment: [...ZERO],
  };
  byNode[nodeId] = created;
  return created;
}

/**
 * Cargas aplicadas de un patrón.
 *
 * Hallazgo importante de `fixtures/`: las cargas distribuidas de pymas
 * (`fx`, `fy`, `fz`) están expresadas en los ejes locales de la barra. Se
 * proyectan con `frame.localAxes`; las cargas nodales sí son globales.
 */
export function computeAppliedLoads(
  model: PymasModel,
  pattern: LoadPatternData,
): AppliedLoadSummary {
  let force: Vec3 = [...ZERO];
  let moment: Vec3 = [...ZERO];
  let nodalForce: Vec3 = [...ZERO];
  let nodalMoment: Vec3 = [...ZERO];
  let distributedForce: Vec3 = [...ZERO];
  let distributedMoment: Vec3 = [...ZERO];

  for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
    const node = model.nodes[nodeId];
    if (!node) continue;
    const f: Vec3 = [load.fx, load.fy, load.fz];
    const m: Vec3 = [load.mx, load.my, load.mz];
    const r = nodePosition(node);
    const contribution = cross(r, f);
    force = add(force, f);
    moment = add(moment, add(m, contribution));
    nodalForce = add(nodalForce, f);
    nodalMoment = add(nodalMoment, add(m, contribution));
  }

  for (const [frameId, loads] of Object.entries(pattern.frameLoads)) {
    const frame = model.frames[frameId];
    if (!frame) continue;
    const { p1, p2 } = framePositions(frame, model.nodes);
    const frameMidpoint = midpoint(p1, p2);
    for (const load of loads) {
      const unitGlobal = projectLoadToGlobal(load, frame.localAxes);
      const total = scale(unitGlobal, frame.length);
      const contribution = cross(frameMidpoint, total);
      force = add(force, total);
      moment = add(moment, contribution);
      distributedForce = add(distributedForce, total);
      distributedMoment = add(distributedMoment, contribution);
    }
  }

  return {
    force,
    moment,
    nodalForce,
    nodalMomentAboutOrigin: nodalMoment,
    distributedForce,
    distributedMomentAboutOrigin: distributedMoment,
    magnitude: norm(force),
  };
}

/**
 * Equilibrio global: ΣF_aplicadas + ΣR = 0 y ΣM_O + Σ(r × R + M_R) = 0.
 *
 * Se acepta una tolerancia relativa del 0.2 %. Los fixtures de F3 tienen las
 * cargas distribuidas redondeadas a un decimal, por lo que el patrón `D`
 * presenta un residuo absoluto pequeño (~0.6 kN sobre ~1 540 kN) que la
 * comprobación relativa identifica como ruido de redondeo.
 */
export function computeEquilibrium(
  model: PymasModel,
  patternId: string,
  resultOverride?: PatternResultData,
): EquilibriumSummary {
  const pattern = model.loadPatterns[patternId];
  if (!pattern) {
    throw new Error(`No existe el patrón de carga "${patternId}".`);
  }
  const result = resultOverride ?? model.results[patternId];
  if (!result) {
    throw new Error(`No existen resultados para el patrón "${patternId}".`);
  }

  const applied = computeAppliedLoads(model, pattern);
  const byNode: Record<string, NodeLoadBalance> = {};

  for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
    const balance = ensureNode(byNode, nodeId);
    balance.appliedForce = add(balance.appliedForce, [load.fx, load.fy, load.fz]);
    balance.appliedMoment = add(balance.appliedMoment, [load.mx, load.my, load.mz]);
  }

  let reactionForce: Vec3 = [...ZERO];
  let reactionMoment: Vec3 = [...ZERO];
  for (const [nodeId, reaction] of Object.entries(result.reactions)) {
    const node = model.nodes[nodeId];
    if (!node) continue;
    const f = vector6ToForce(reaction);
    const m = vector6ToMoment(reaction);
    const r = nodePosition(node);
    reactionForce = add(reactionForce, f);
    reactionMoment = add(reactionMoment, add(m, cross(r, f)));
    const balance = ensureNode(byNode, nodeId);
    balance.reactionForce = add(balance.reactionForce, f);
    balance.reactionMoment = add(balance.reactionMoment, m);
  }

  const residualForce: Vec3 = add(applied.force, reactionForce);
  const residualMoment: Vec3 = add(applied.moment, reactionMoment);
  const appliedForceNorm = norm(applied.force);
  const reactionForceNorm = norm(reactionForce);
  const appliedMomentNorm = norm(applied.moment);
  const reactionMomentNorm = norm(reactionMoment);
  const residualForceNorm = norm(residualForce);
  const residualMomentNorm = norm(residualMoment);
  const forceScale = Math.max(appliedForceNorm, reactionForceNorm, 1);
  const momentScale = Math.max(appliedMomentNorm, reactionMomentNorm, 1);
  const relativeForceResidual = residualForceNorm / forceScale;
  const relativeMomentResidual = residualMomentNorm / momentScale;
  const forceTolerance = Math.max(1e-6, forceScale * 0.002);
  const momentTolerance = Math.max(1e-6, momentScale * 0.002);

  const forceOk = residualForceNorm <= forceTolerance;
  const momentOk = residualMomentNorm <= momentTolerance;

  return {
    patternId,
    applied: { force: applied.force, moment: applied.moment },
    reactions: { force: reactionForce, moment: reactionMoment },
    residual: { force: residualForce, moment: residualMoment },
    appliedForceNorm,
    reactionForceNorm,
    appliedMomentNorm,
    reactionMomentNorm,
    residualForceNorm,
    residualMomentNorm,
    relativeForceResidual,
    relativeMomentResidual,
    forceTolerance,
    momentTolerance,
    balanced: forceOk && momentOk,
    byNode,
  };
}

/** Suma global de reacciones de un resultado (fuerza y momento respecto al origen). */
export function sumResultReactions(
  model: PymasModel,
  result: PatternResultData,
): { force: Vec3; moment: Vec3 } {
  let force: Vec3 = [...ZERO];
  let moment: Vec3 = [...ZERO];
  for (const [nodeId, reaction] of Object.entries(result.reactions)) {
    const node = model.nodes[nodeId];
    if (!node) continue;
    const reactionForce = vector6ToForce(reaction);
    const reactionMoment = vector6ToMoment(reaction);
    const r = nodePosition(node);
    force = add(force, reactionForce);
    moment = add(moment, add(reactionMoment, cross(r, reactionForce)));
  }
  return { force, moment };
}

/** Equilibrio de una combinación lineal calculada en el cliente. */
export function computeCombinationEquilibrium(
  model: PymasModel,
  combination: LoadCombinationData,
): EquilibriumSummary {
  const combined = linearCombination(model, combination.factors);
  const representativePattern =
    model.loadPatterns[combination.id] ??
    model.loadPatterns[Object.keys(combination.factors)[0] ?? ""];
  if (!representativePattern) {
    throw new Error(`La combinación "${combination.id}" no tiene patrones base.`);
  }

  // Para una combinación, las cargas aplicadas son la suma ponderada de las
  // cargas de cada patrón, no las de un patrón aislado.
  const appliedPattern: LoadPatternData = {
    id: combination.id,
    name: combination.name,
    nodalLoads: {},
    frameLoads: {},
  };
  for (const [patternId, factor] of Object.entries(combination.factors)) {
    const pattern = model.loadPatterns[patternId];
    if (!pattern) continue;
    for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
      const current = appliedPattern.nodalLoads[nodeId] ?? {
        fx: 0,
        fy: 0,
        fz: 0,
        mx: 0,
        my: 0,
        mz: 0,
      };
      appliedPattern.nodalLoads[nodeId] = {
        fx: current.fx + load.fx * factor,
        fy: current.fy + load.fy * factor,
        fz: current.fz + load.fz * factor,
        mx: current.mx + load.mx * factor,
        my: current.my + load.my * factor,
        mz: current.mz + load.mz * factor,
      };
    }
    for (const [frameId, loads] of Object.entries(pattern.frameLoads)) {
      const list = appliedPattern.frameLoads[frameId] ?? [];
      for (const load of loads) {
        list.push({
          ...load,
          fx: load.fx * factor,
          fy: load.fy * factor,
          fz: load.fz * factor,
        });
      }
      appliedPattern.frameLoads[frameId] = list;
    }
  }

  const applied = computeAppliedLoads(model, appliedPattern);
  const byNode: Record<string, NodeLoadBalance> = {};
  for (const [nodeId, load] of Object.entries(appliedPattern.nodalLoads)) {
    const balance = ensureNode(byNode, nodeId);
    balance.appliedForce = add(balance.appliedForce, [load.fx, load.fy, load.fz]);
    balance.appliedMoment = add(balance.appliedMoment, [load.mx, load.my, load.mz]);
  }
  let reactionForce: Vec3 = [...ZERO];
  let reactionMoment: Vec3 = [...ZERO];
  for (const [nodeId, reaction] of Object.entries(combined.reactions)) {
    const node = model.nodes[nodeId];
    if (!node) continue;
    const f = vector6ToForce(reaction);
    const m = vector6ToMoment(reaction);
    const r = nodePosition(node);
    reactionForce = add(reactionForce, f);
    reactionMoment = add(reactionMoment, add(m, cross(r, f)));
    const balance = ensureNode(byNode, nodeId);
    balance.reactionForce = add(balance.reactionForce, f);
    balance.reactionMoment = add(balance.reactionMoment, m);
  }
  const residualForce = add(applied.force, reactionForce);
  const residualMoment = add(applied.moment, reactionMoment);
  const appliedForceNorm = norm(applied.force);
  const reactionForceNorm = norm(reactionForce);
  const appliedMomentNorm = norm(applied.moment);
  const reactionMomentNorm = norm(reactionMoment);
  const residualForceNorm = norm(residualForce);
  const residualMomentNorm = norm(residualMoment);
  const forceScale = Math.max(appliedForceNorm, reactionForceNorm, 1);
  const momentScale = Math.max(appliedMomentNorm, reactionMomentNorm, 1);
  const forceTolerance = Math.max(1e-6, forceScale * 0.002);
  const momentTolerance = Math.max(1e-6, momentScale * 0.002);

  return {
    patternId: combination.id,
    applied: { force: applied.force, moment: applied.moment },
    reactions: { force: reactionForce, moment: reactionMoment },
    residual: { force: residualForce, moment: residualMoment },
    appliedForceNorm,
    reactionForceNorm,
    appliedMomentNorm,
    reactionMomentNorm,
    residualForceNorm,
    residualMomentNorm,
    relativeForceResidual: residualForceNorm / forceScale,
    relativeMomentResidual: residualMomentNorm / momentScale,
    forceTolerance,
    momentTolerance,
    balanced:
      residualForceNorm <= forceTolerance && residualMomentNorm <= momentTolerance,
    byNode,
  };
}
