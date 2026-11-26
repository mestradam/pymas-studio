import type { PymasModel } from "../types/pymas";
import { projectLoadToGlobal, type Vec3 } from "./geometry";

/**
 * Cargas a dibujar para un caso: un patrón (factor 1) o una combinación
 * lineal de patrones con sus factores.
 *
 * Las cargas nodales se suman por nudo. Las distribuidas (uniformes en pymas)
 * se proyectan a global y se suman por barra, de modo que una combinación
 * muestra una sola resultante por barra en lugar de flechas superpuestas.
 */

export type LoadFactors = Record<string, number>;

export interface CombinedNodalLoad {
  force: Vec3;
  moment: Vec3;
}

export interface CombinedLoads {
  nodal: Record<string, CombinedNodalLoad>;
  /** Carga distribuida uniforme resultante por barra, en ejes globales. */
  frames: Record<string, Vec3>;
}

function addScaled(target: Vec3, value: Vec3, factor: number): void {
  target[0] += value[0] * factor;
  target[1] += value[1] * factor;
  target[2] += value[2] * factor;
}

export function combinePatternLoads(
  model: PymasModel,
  factors: LoadFactors,
): CombinedLoads {
  const nodal: Record<string, CombinedNodalLoad> = {};
  const frames: Record<string, Vec3> = {};

  for (const [patternId, factor] of Object.entries(factors)) {
    const pattern = model.loadPatterns[patternId];
    if (!pattern || !Number.isFinite(factor) || factor === 0) continue;

    for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
      if (!model.nodes[nodeId]) continue;
      const entry = (nodal[nodeId] ??= { force: [0, 0, 0], moment: [0, 0, 0] });
      addScaled(entry.force, [load.fx, load.fy, load.fz], factor);
      addScaled(entry.moment, [load.mx, load.my, load.mz], factor);
    }

    for (const [frameId, loads] of Object.entries(pattern.frameLoads)) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const total = (frames[frameId] ??= [0, 0, 0]);
      for (const load of loads) {
        addScaled(total, projectLoadToGlobal(load, frame.localAxes), factor);
      }
    }
  }

  return { nodal, frames };
}
