/**
 * Visibilidad de barras en el visor.
 *
 * El visor no oculta objetos uno por uno: dibuja una **vista filtrada** del
 * modelo (`filterModel`) en la que sólo quedan las barras visibles, sus nudos
 * y los apoyos de esos nudos. Como todas las capas iteran `frameOrder` /
 * `nodeOrder` o buscan por id en `frames` / `nodes`, lo oculto desaparece con
 * sus cargas, diagramas, deformada, reacciones y etiquetas, y las escalas
 * automáticas (mapa de colores, diagramas, flechas) se ajustan a lo visible.
 */

import type { FrameData, PymasModel } from "../types/pymas";
import { upAxisIndex, type UpAxis } from "./upAxis";

export type FrameKind = "column" | "beam" | "brace";

export const FRAME_KINDS: readonly FrameKind[] = ["column", "beam", "brace"];

export const FRAME_KIND_LABELS: Record<FrameKind, string> = {
  column: "Columnas",
  beam: "Vigas",
  brace: "Diagonales",
};

export type CoordinateAxis = "x" | "y" | "z";

export const COORDINATE_AXES: readonly CoordinateAxis[] = ["x", "y", "z"];

export interface CoordinateRange {
  axis: CoordinateAxis;
  min: number;
  max: number;
}

export interface VisibilityFilter {
  hiddenFrames: string[];
  hiddenSections: string[];
  hiddenMaterials: string[];
  hiddenKinds: FrameKind[];
  range: CoordinateRange | null;
}

export const EMPTY_VISIBILITY: VisibilityFilter = {
  hiddenFrames: [],
  hiddenSections: [],
  hiddenMaterials: [],
  hiddenKinds: [],
  range: null,
};

export function isFilterActive(filter: VisibilityFilter): boolean {
  return (
    filter.hiddenFrames.length > 0 ||
    filter.hiddenSections.length > 0 ||
    filter.hiddenMaterials.length > 0 ||
    filter.hiddenKinds.length > 0 ||
    filter.range !== null
  );
}

/** Tolerancia angular para considerar una barra vertical u horizontal. */
const KIND_TOLERANCE_DEG = 10;
const SIN_TOLERANCE = Math.sin((KIND_TOLERANCE_DEG * Math.PI) / 180);

/**
 * Columna si la barra está a menos de 10° del eje vertical, viga si está a
 * menos de 10° del plano horizontal y diagonal en otro caso.
 */
export function classifyFrame(
  model: PymasModel,
  frame: FrameData,
  upAxis: UpAxis,
): FrameKind {
  const ni = model.nodes[frame.nodeI];
  const nj = model.nodes[frame.nodeJ];
  if (!ni || !nj) return "beam";
  const d = [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z];
  const length = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (length <= 0) return "beam";
  const vertical = Math.abs(d[upAxisIndex(upAxis)]!) / length;
  const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
  if (horizontal <= SIN_TOLERANCE) return "column";
  if (vertical <= SIN_TOLERANCE) return "beam";
  return "brace";
}

function axisValue(node: { x: number; y: number; z: number }, axis: CoordinateAxis): number {
  return node[axis];
}

/** Tolerancia de coordenadas: una milésima de la mayor dimensión del modelo. */
export function coordinateTolerance(model: PymasModel): number {
  let span = 0;
  for (const axis of COORDINATE_AXES) {
    let min = Infinity;
    let max = -Infinity;
    for (const id of model.nodeOrder) {
      const node = model.nodes[id];
      if (!node) continue;
      min = Math.min(min, node[axis]);
      max = Math.max(max, node[axis]);
    }
    if (Number.isFinite(min)) span = Math.max(span, max - min);
  }
  return Math.max(span * 1e-3, 1e-9);
}

/** Coordenadas distintas de los nudos en un eje (niveles, ejes de pórtico). */
export function coordinateLevels(model: PymasModel, axis: CoordinateAxis): number[] {
  const tolerance = coordinateTolerance(model);
  const values = model.nodeOrder
    .map((id) => model.nodes[id])
    .filter((node) => node !== undefined)
    .map((node) => axisValue(node, axis))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const levels: number[] = [];
  for (const value of values) {
    const last = levels[levels.length - 1];
    if (last === undefined || value - last > tolerance) levels.push(value);
  }
  return levels;
}

/** Barras que llegan a un nudo. */
export function framesAtNode(model: PymasModel, nodeId: string): string[] {
  return model.frameOrder.filter((id) => {
    const frame = model.frames[id];
    return frame !== undefined && (frame.nodeI === nodeId || frame.nodeJ === nodeId);
  });
}

/** Ids de las barras visibles según el filtro. */
export function visibleFrameIds(
  model: PymasModel,
  filter: VisibilityFilter,
  upAxis: UpAxis,
): Set<string> {
  const hiddenFrames = new Set(filter.hiddenFrames);
  const hiddenSections = new Set(filter.hiddenSections);
  const hiddenMaterials = new Set(filter.hiddenMaterials);
  const hiddenKinds = new Set(filter.hiddenKinds);
  const range = filter.range;
  const tolerance = range ? coordinateTolerance(model) : 0;

  const visible = new Set<string>();
  for (const id of model.frameOrder) {
    const frame = model.frames[id];
    if (!frame) continue;
    if (hiddenFrames.has(id)) continue;
    if (hiddenSections.has(frame.sectionId)) continue;
    if (hiddenMaterials.has(frame.materialId)) continue;
    if (hiddenKinds.size > 0 && hiddenKinds.has(classifyFrame(model, frame, upAxis))) {
      continue;
    }
    if (range) {
      const ni = model.nodes[frame.nodeI];
      const nj = model.nodes[frame.nodeJ];
      if (!ni || !nj) continue;
      const inside = (value: number) =>
        value >= range.min - tolerance && value <= range.max + tolerance;
      if (!inside(axisValue(ni, range.axis)) || !inside(axisValue(nj, range.axis))) {
        continue;
      }
    }
    visible.add(id);
  }
  return visible;
}

/**
 * Vista del modelo con sólo las barras visibles, sus nudos y los apoyos de
 * esos nudos. Si todo es visible devuelve el mismo objeto.
 */
export function filterModel(model: PymasModel, visibleIds: Set<string>): PymasModel {
  const allVisible =
    visibleIds.size === model.frameOrder.length &&
    model.frameOrder.every((id) => visibleIds.has(id));
  if (allVisible) return model;

  const frameOrder = model.frameOrder.filter((id) => visibleIds.has(id));
  const frames: Record<string, FrameData> = {};
  const nodeIds = new Set<string>();
  for (const id of frameOrder) {
    const frame = model.frames[id]!;
    frames[id] = frame;
    nodeIds.add(frame.nodeI);
    nodeIds.add(frame.nodeJ);
  }

  const nodeOrder = model.nodeOrder.filter((id) => nodeIds.has(id));
  const nodes: PymasModel["nodes"] = {};
  for (const id of nodeOrder) nodes[id] = model.nodes[id]!;

  const supports: PymasModel["supports"] = {};
  for (const [id, support] of Object.entries(model.supports)) {
    if (nodeIds.has(support.node)) supports[id] = support;
  }

  return { ...model, frames, frameOrder, nodes, nodeOrder, supports };
}

const filterCache = new WeakMap<
  PymasModel,
  { filter: VisibilityFilter; upAxis: UpAxis; view: PymasModel }
>();

/** `filterModel(visibleFrameIds(...))` con caché por modelo, filtro y eje. */
export function visibleModel(
  model: PymasModel,
  filter: VisibilityFilter,
  upAxis: UpAxis,
): PymasModel {
  if (!isFilterActive(filter)) return model;
  const cached = filterCache.get(model);
  if (cached && cached.filter === filter && cached.upAxis === upAxis) return cached.view;
  const view = filterModel(model, visibleFrameIds(model, filter, upAxis));
  filterCache.set(model, { filter, upAxis, view });
  return view;
}
