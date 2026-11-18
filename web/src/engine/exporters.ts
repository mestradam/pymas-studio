import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  frameDemandPercent,
  type ComparisonValue,
  type ModelComparison,
} from "./comparison";
import { frameForceSummaries } from "./inspection";
import { isFiniteNumber } from "./geometry";

/** Exportadores CSV puros, compartidos por la UI y las pruebas. */

type CsvValue = string | number | null | undefined;

function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function csvNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFiniteNumber(value)) return "";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const rounded = abs >= 1e-6 && abs < 1e9 ? Number(value.toPrecision(10)) : value;
  return String(rounded);
}

export interface CsvContext {
  modelALabel: string;
  modelBLabel?: string;
  caseLabel: string;
}

export function nodalDisplacementsCsv(
  model: PymasModel,
  result: PatternResultData,
  modelLabel?: string,
): string {
  const unit = model.meta.units.length;
  const rows: CsvValue[][] = [
    [
      "node",
      "name",
      `x (${unit})`,
      `y (${unit})`,
      `z (${unit})`,
      `ux (${unit})`,
      `uy (${unit})`,
      `uz (${unit})`,
      "rx (rad)",
      "ry (rad)",
      "rz (rad)",
      `|u| (${unit})`,
    ],
  ];
  for (const nodeId of model.nodeOrder) {
    const node = model.nodes[nodeId];
    const displacement = result.nodalDisplacements[nodeId];
    if (!node || !displacement) continue;
    rows.push([
      nodeId,
      node.name || nodeId,
      csvNumber(node.x),
      csvNumber(node.y),
      csvNumber(node.z),
      csvNumber(displacement.ux),
      csvNumber(displacement.uy),
      csvNumber(displacement.uz),
      csvNumber(displacement.rx),
      csvNumber(displacement.ry),
      csvNumber(displacement.rz),
      csvNumber(Math.hypot(displacement.ux, displacement.uy, displacement.uz)),
    ]);
  }
  if (modelLabel) {
    rows.unshift(["modelo", modelLabel], []);
  }
  return toCsv(rows);
}

export function reactionsCsv(
  model: PymasModel,
  result: PatternResultData,
  modelLabel?: string,
): string {
  const force = model.meta.units.force;
  const length = model.meta.units.length;
  const rows: CsvValue[][] = [
    [
      "support",
      "node",
      "node_name",
      "kind",
      `fx (${force})`,
      `fy (${force})`,
      `fz (${force})`,
      `mx (${force}·${length})`,
      `my (${force}·${length})`,
      `mz (${force}·${length})`,
      `|F| (${force})`,
      `|M| (${force}·${length})`,
    ],
  ];
  for (const support of Object.values(model.supports)) {
    const reaction = result.reactions[support.node];
    const node = model.nodes[support.node];
    if (!reaction || !node) continue;
    rows.push([
      support.id,
      support.node,
      node.name || support.node,
      support.kind,
      csvNumber(reaction.fx),
      csvNumber(reaction.fy),
      csvNumber(reaction.fz),
      csvNumber(reaction.mx),
      csvNumber(reaction.my),
      csvNumber(reaction.mz),
      csvNumber(Math.hypot(reaction.fx, reaction.fy, reaction.fz)),
      csvNumber(Math.hypot(reaction.mx, reaction.my, reaction.mz)),
    ]);
  }
  if (modelLabel) {
    rows.unshift(["modelo", modelLabel], []);
  }
  return toCsv(rows);
}

export function frameForcesCsv(
  model: PymasModel,
  result: PatternResultData,
  modelLabel?: string,
): string {
  const force = model.meta.units.force;
  const length = model.meta.units.length;
  const rows: CsvValue[][] = [
    [
      "frame",
      "name",
      "material",
      "section",
      `|Fx| (${force})`,
      `|Fy| (${force})`,
      `|Fz| (${force})`,
      `|Mx| (${force}·${length})`,
      `|My| (${force}·${length})`,
      `|Mz| (${force}·${length})`,
      `|F|max (${force})`,
      `|M|max (${force}·${length})`,
    ],
  ];
  for (const summary of frameForceSummaries(model, result)) {
    rows.push([
      summary.frameId,
      summary.frameName,
      summary.materialName,
      summary.sectionName,
      csvNumber(summary.axial),
      csvNumber(summary.shearY),
      csvNumber(summary.shearZ),
      csvNumber(summary.torsion),
      csvNumber(summary.momentY),
      csvNumber(summary.momentZ),
      csvNumber(summary.maxForce),
      csvNumber(summary.maxMoment),
    ]);
  }
  if (modelLabel) {
    rows.unshift(["modelo", modelLabel], []);
  }
  return toCsv(rows);
}

function comparisonRow(label: string, value: ComparisonValue): CsvValue[] {
  return [
    label,
    csvNumber(value.a),
    csvNumber(value.b),
    csvNumber(value.delta),
    value.percent === null ? "" : csvNumber(value.percent),
  ];
}

/**
 * CSV comparativo con bloques separados por una línea vacía: resumen, nodos,
 * reacciones y barras. Se puede abrir en hoja de cálculo o procesar por secciones.
 */
export function comparisonCsv(
  comparison: ModelComparison,
  context: CsvContext,
): string {
  const rows: CsvValue[][] = [
    ["Comparación de modelos PyMAS Studio 3D"],
    ["modelo_A", context.modelALabel],
    ["modelo_B", context.modelBLabel ?? ""],
    ["caso", context.caseLabel],
    [],
    ["Resumen"],
    ["métrica", "modelo_A", "modelo_B", "delta", "delta_%"],
    comparisonRow("desplazamiento_máximo", comparison.summary.maxDisplacement),
    comparisonRow("cortante_basal", comparison.summary.baseShear),
    comparisonRow("reacción_vertical_basal", comparison.summary.baseAxial),
    comparisonRow("momento_basal", comparison.summary.baseMoment),
    comparisonRow("reacción_máxima", comparison.summary.maxReactionForce),
    comparisonRow("momento_de_reacción_máximo", comparison.summary.maxReactionMoment),
    comparisonRow("fuerza_máxima_en_barra", comparison.summary.maxFrameForce),
    comparisonRow("momento_máximo_en_barra", comparison.summary.maxFrameMoment),
    ["nudos_comunes", comparison.summary.nodeCount],
    ["reacciones_comunes", comparison.summary.reactionCount],
    ["barras_comunes", comparison.summary.frameCount],
    ["barras_con_aumento", comparison.summary.frameIncreaseCount],
    ["barras_con_reducción", comparison.summary.frameDecreaseCount],
    ["barras_sin_cambio", comparison.summary.frameEqualCount],
    [],
    ["Desplazamientos nodales"],
    ["node", "name", "|u|_A", "|u|_B", "delta", "delta_%"],
    ...comparison.nodes.map((node) => [
      node.nodeId,
      node.label,
      csvNumber(node.a),
      csvNumber(node.b),
      csvNumber(node.delta),
      node.percent === null ? "" : csvNumber(node.percent),
    ]),
    [],
    ["Reacciones en apoyos"],
    [
      "support",
      "node",
      "name",
      "kind",
      "|F|_A",
      "|F|_B",
      "delta_F",
      "delta_F_%",
      "|M|_A",
      "|M|_B",
      "delta_M",
      "delta_M_%",
    ],
    ...comparison.reactions.map((reaction) => [
      reaction.supportId,
      reaction.nodeId,
      reaction.label,
      reaction.kind,
      csvNumber(reaction.force.a),
      csvNumber(reaction.force.b),
      csvNumber(reaction.force.delta),
      reaction.force.percent === null ? "" : csvNumber(reaction.force.percent),
      csvNumber(reaction.moment.a),
      csvNumber(reaction.moment.b),
      csvNumber(reaction.moment.delta),
      reaction.moment.percent === null ? "" : csvNumber(reaction.moment.percent),
    ]),
    [],
    ["Barras comunes"],
    [
      "frame",
      "name",
      "material",
      "section",
      "|F|max_A",
      "|F|max_B",
      "delta_F",
      "delta_F_%",
      "|M|max_A",
      "|M|max_B",
      "delta_M",
      "delta_M_%",
      "demanda_%",
    ],
    ...comparison.frames.map((frame) => {
      const demand = frameDemandPercent(frame);
      return [
        frame.frameId,
        frame.label,
        frame.materialName,
        frame.sectionName,
        csvNumber(frame.maxForce.a),
        csvNumber(frame.maxForce.b),
        csvNumber(frame.maxForce.delta),
        frame.maxForce.percent === null ? "" : csvNumber(frame.maxForce.percent),
        csvNumber(frame.maxMoment.a),
        csvNumber(frame.maxMoment.b),
        csvNumber(frame.maxMoment.delta),
        frame.maxMoment.percent === null ? "" : csvNumber(frame.maxMoment.percent),
        demand === null ? "" : csvNumber(demand),
      ];
    }),
  ];
  return toCsv(rows);
}
