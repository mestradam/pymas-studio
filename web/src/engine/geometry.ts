import type {
  DistributedLoad,
  FrameData,
  LocalAxes,
  NodeData,
  PymasModel,
  SectionData,
} from "../types/pymas";

export type Vec3 = [number, number, number];

export const WORLD_UP: Vec3 = [0, 0, 1];
export const ZERO3: Vec3 = [0, 0, 0];

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function asVec3(value: unknown, fallback: Vec3 = ZERO3): Vec3 {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value;
    if (isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z)) {
      return [x, y, z];
    }
  }
  return [fallback[0], fallback[1], fallback[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const n = length(a);
  return n > 1e-15 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

export function nodePosition(node: Pick<NodeData, "x" | "y" | "z">): Vec3 {
  return [node.x, node.y, node.z];
}

export function framePositions(
  frame: FrameData,
  nodes: Record<string, NodeData>,
): { p1: Vec3; p2: Vec3 } {
  const ni = nodes[frame.nodeI];
  const nj = nodes[frame.nodeJ];
  if (!ni || !nj) return { p1: [0, 0, 0], p2: [0, 0, 0] };
  return { p1: nodePosition(ni), p2: nodePosition(nj) };
}

/** Rotación de Rodrigues: gira `v` alrededor del eje unitario `axis`. */
export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-15) return [...v];
  const unit = normalize(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const term1 = scale(v, cos);
  const term2 = scale(cross(unit, v), sin);
  const term3 = scale(unit, dot(unit, v) * (1 - cos));
  return add(add(term1, term2), term3);
}

/**
 * Convención de ejes locales del plano (sección 5.2):
 *   ex = (Pj - Pi) / L
 *   caso general:  ey = normalize(K × ex), ez = ex × ey
 *   caso columna:  ey = (0,1,0), ez = ex × ey
 *   roll_angle:    rota ey/ez alrededor de ex (Rodrigues)
 */
export function computeLocalAxes(
  p1: Vec3,
  p2: Vec3,
  rollAngle = 0,
): LocalAxes {
  const rawEx = sub(p2, p1);
  const L = length(rawEx);
  const ex: Vec3 = L > 1e-15 ? scale(rawEx, 1 / L) : [1, 0, 0];

  let ey: Vec3;
  if (Math.abs(dot(ex, WORLD_UP)) >= 0.999) {
    ey = [0, 1, 0];
  } else {
    ey = normalize(cross(WORLD_UP, ex));
  }
  if (length(ey) < 1e-15) ey = [0, 1, 0];

  if (Number.isFinite(rollAngle) && Math.abs(rollAngle) > 1e-15) {
    ey = normalize(rotateAroundAxis(ey, ex, rollAngle));
  }

  let ez: Vec3 = normalize(cross(ex, ey));
  // Re-ortogonaliza por seguridad numérica.
  ey = normalize(cross(ez, ex));
  ez = normalize(cross(ex, ey));

  return {
    x: [ex[0], ex[1], ex[2]],
    y: [ey[0], ey[1], ey[2]],
    z: [ez[0], ez[1], ez[2]],
  };
}

export function localAxesFromUnknown(value: unknown): LocalAxes | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = asVec3(raw.x, [Number.NaN, Number.NaN, Number.NaN]);
  const y = asVec3(raw.y, [Number.NaN, Number.NaN, Number.NaN]);
  const z = asVec3(raw.z, [Number.NaN, Number.NaN, Number.NaN]);
  if (![...x, ...y, ...z].every(Number.isFinite)) return null;
  return {
    x: [x[0], x[1], x[2]],
    y: [y[0], y[1], y[2]],
    z: [z[0], z[1], z[2]],
  };
}

export function axesAreOrthonormal(axes: LocalAxes, tolerance = 1e-4): boolean {
  const x = axes.x;
  const y = axes.y;
  const z = axes.z;
  const unit = (v: Vec3) => Math.abs(length(v) - 1) <= tolerance;
  const orth = (a: Vec3, b: Vec3) => Math.abs(dot(a, b)) <= tolerance;
  const determinant =
    x[0] * (y[1] * z[2] - y[2] * z[1]) -
    x[1] * (y[0] * z[2] - y[2] * z[0]) +
    x[2] * (y[0] * z[1] - y[1] * z[0]);
  return (
    unit(x) &&
    unit(y) &&
    unit(z) &&
    orth(x, y) &&
    orth(x, z) &&
    orth(y, z) &&
    Math.abs(determinant - 1) <= tolerance * 10
  );
}

export function frameLength(frame: FrameData, nodes: Record<string, NodeData>): number {
  const { p1, p2 } = framePositions(frame, nodes);
  return distance(p1, p2);
}

/** Punto a una fracción ξ ∈ [0,1] de la barra (sin deformación). */
export function pointAtStation(p1: Vec3, p2: Vec3, xi: number): Vec3 {
  return [p1[0] + xi * (p2[0] - p1[0]), p1[1] + xi * (p2[1] - p1[1]), p1[2] + xi * (p2[2] - p1[2])];
}

export function sectionDisplayDimensions(section: SectionData): {
  dy: number;
  dz: number;
} {
  return {
    dy: Math.max(section.dy, 1e-6),
    dz: Math.max(section.dz, 1e-6),
  };
}

export function projectLoadToGlobal(load: DistributedLoad, axes: LocalAxes): Vec3 {
  if (load.coordinateSystem === "global") {
    return [load.fx, load.fy, load.fz];
  }
  return [
    load.fx * axes.x[0] + load.fy * axes.y[0] + load.fz * axes.z[0],
    load.fx * axes.x[1] + load.fy * axes.y[1] + load.fz * axes.z[1],
    load.fx * axes.x[2] + load.fy * axes.y[2] + load.fz * axes.z[2],
  ];
}

export function distributedLoadMagnitude(load: DistributedLoad): number {
  return Math.hypot(load.fx, load.fy, load.fz);
}

export interface ModelBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
  diagonal: number;
}

export function modelBounds(model: PymasModel): ModelBounds {
  return nodeBounds(Object.values(model.nodes));
}

export function nodeBounds(nodes: NodeData[]): ModelBounds {
  if (nodes.length === 0) {
    return {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      center: [0, 0, 0],
      size: [2, 2, 2],
      diagonal: Math.sqrt(12),
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    minZ = Math.min(minZ, n.z);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
    maxZ = Math.max(maxZ, n.z);
  }
  if (!Number.isFinite(minX)) {
    return {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      center: [0, 0, 0],
      size: [2, 2, 2],
      diagonal: Math.sqrt(12),
    };
  }
  const min: Vec3 = [minX, minY, minZ];
  const max: Vec3 = [maxX, maxY, maxZ];
  const size: Vec3 = [maxX - minX, maxY - minY, maxZ - minZ];
  const diagonal = Math.max(length(size), 1e-6);
  return {
    min,
    max,
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size,
    diagonal,
  };
}

/** Grilla "redonda" (1, 2, 5 × 10^n) que contiene aproximadamente el modelo. */
export function niceGridSize(diagonal: number): { size: number; divisions: number } {
  const target = Math.max(diagonal * 2, 1e-3);
  const raw = target / 20;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const normalized = raw / base;
  let step: number;
  if (normalized <= 1) step = 1;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 5) step = 5;
  else step = 10;
  step *= base;
  const divisions = 20;
  return { size: step * divisions, divisions };
}

export function formatNumber(value: number, engineering = true): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (engineering && (abs < 1e-3 || abs >= 1e5)) {
    return value.toExponential(2);
  }
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toPrecision(3);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
