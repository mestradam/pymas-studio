import type {
  FrameData,
  FrameStationDisplacements,
  FrameStationForces,
  PatternResultData,
  PymasModel,
} from "../types/pymas";
import {
  add,
  framePositions,
  modelBounds,
  pointAtStation,
  scale,
  type Vec3,
} from "./geometry";

/**
 * Motor puro de diagramas para el visor.
 *
 * Las acciones internas y los desplazamientos internos que exporta pymas
 * están expresados en el sistema local de cada barra.  Por eso cada serie se
 * proyecta sobre los ejes locales `x`, `y`, `z` del modelo normalizado (los
 * `local_axes` exportados tienen prioridad; si faltan, el parser los calcula
 * con la convención del plano).
 *
 * Convención de dibujo (la ordenada siempre es perpendicular a la barra):
 *   fx (N)  -> eje perpendicular a la barra dentro del plano del modelo si
 *              es plano (normalmente y); eje z en modelos 3D
 *   fy (Vy) -> eje y (cortante en el plano x-y)
 *   fz (Vz) -> eje z (cortante en el plano x-z)
 *   mx (T)  -> igual que N
 *   my (My) -> eje z (flexión en el plano x-z)
 *   mz (Mz) -> eje y (flexión en el plano x-y)
 *   ux/rx -> eje x, uy/ry -> eje y, uz/rz -> eje z
 *
 * Cada diagrama conserva las estaciones reales exportadas (normalizadas 0..1),
 * el punto indeformado sobre la barra y el punto desplazado por la ordenada del
 * diagrama, listo para dibujar una polilínea 3D sin volver a conocer la
 * geometría de la barra.
 */

export const FORCE_COMPONENTS = ["fx", "fy", "fz", "mx", "my", "mz"] as const;
export const DISPLACEMENT_COMPONENTS = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;

export type ForceComponent = (typeof FORCE_COMPONENTS)[number];
export type DisplacementComponent = (typeof DISPLACEMENT_COMPONENTS)[number];
export type DiagramComponent = ForceComponent | DisplacementComponent;
export type DiagramKind = "force" | "displacement";
export type LocalAxis = "x" | "y" | "z";

export const DEFAULT_DIAGRAM_STATIONS = [0, 0.25, 0.5, 0.75, 1];

/** Nombre corto de cada acción interna (N, Vy, Vz, T, My, Mz). */
export const FORCE_LABELS: Record<ForceComponent, string> = {
  fx: "N",
  fy: "Vy",
  fz: "Vz",
  mx: "T",
  my: "My",
  mz: "Mz",
};

/** Nombre descriptivo de cada acción interna, para gráficas e inspector. */
export const FORCE_LONG_LABELS: Record<ForceComponent, string> = {
  fx: "N · axial",
  fy: "Vy · cortante",
  fz: "Vz · cortante",
  mx: "T · torsión",
  my: "My · flexión",
  mz: "Mz · flexión",
};

/**
 * Eje local sobre el que se dibuja cada acción interna. N y T actúan a lo
 * largo del eje x de la barra; dibujarlos sobre él los haría invisibles, así
 * que se abaten al eje local z, perpendicular a la barra.
 */
export const FORCE_PLOT_AXIS: Record<ForceComponent, LocalAxis> = {
  fx: "z",
  fy: "y",
  fz: "z",
  mx: "z",
  my: "z",
  mz: "y",
};

/** Eje local de cada componente de desplazamiento interno. */
export const DISPLACEMENT_PLOT_AXIS: Record<DisplacementComponent, LocalAxis> = {
  ux: "x",
  uy: "y",
  uz: "z",
  rx: "x",
  ry: "y",
  rz: "z",
};

export class MissingFrameError extends Error {
  constructor(frameId: string) {
    super(`La barra "${frameId}" no existe en el modelo.`);
    this.name = "MissingFrameError";
  }
}

export class MissingFrameResultError extends Error {
  constructor(frameId: string) {
    super(`No hay resultados de cálculo para la barra "${frameId}".`);
    this.name = "MissingFrameResultError";
  }
}

export interface DiagramPeak {
  value: number;
  absValue: number;
  /** Coordenada normalizada 0..1 a lo largo de la barra. */
  station: number;
  index: number;
  /** Punto indeformado sobre la barra. */
  position: Vec3;
  /** Punto del diagrama (posición + ordenada). */
  display: Vec3;
  /** `i`/`j` si el pico cae en un extremo; `interior` en caso contrario. */
  end: "i" | "j" | "interior";
}

export interface DiagramSeries {
  frameId: string;
  kind: DiagramKind;
  component: DiagramComponent;
  axis: LocalAxis;
  /** Vector unitario del eje local usado para la ordenada. */
  axisVector: Vec3;
  scale: number;
  stations: number[];
  values: number[];
  /** Puntos indeformados sobre el eje de la barra. */
  points: Vec3[];
  /** Ordenadas en coordenadas globales: axisVector * value * scale. */
  offsets: Vec3[];
  /** points[i] + offsets[i], listo para la polilínea 3D. */
  displayPoints: Vec3[];
  min: DiagramPeak;
  max: DiagramPeak;
  absMax: DiagramPeak;
  hasExplicitStations: boolean;
}

export interface DiagramSample {
  station: number;
  value: number;
  position: Vec3;
  offset: Vec3;
  display: Vec3;
}

export interface AutoDiagramScaleOptions {
  /** Fracción de la diagonal del modelo usada como ordenada máxima. */
  targetFraction?: number;
  /** Componentes a considerar (por defecto las seis acciones internas). */
  components?: readonly ForceComponent[];
  /** Barras a considerar (por defecto todas las que tengan resultados). */
  frames?: readonly string[];
}

export function diagramKindOf(component: DiagramComponent): DiagramKind {
  return (FORCE_COMPONENTS as readonly string[]).includes(component)
    ? "force"
    : "displacement";
}

const PLANE_NORMALS = new WeakMap<PymasModel, { normal: Vec3 | null }>();

/**
 * Normal del plano que contiene todos los nudos, o `null` si el modelo es
 * tridimensional. Un modelo lineal (todos los nudos sobre una recta) se
 * considera contenido en el plano XY global, que es la convención de pymas
 * para vigas y celosías planas. Se memoriza por modelo.
 */
export function modelPlaneNormal(model: PymasModel): Vec3 | null {
  const cached = PLANE_NORMALS.get(model);
  if (cached) return cached.normal;

  const points: Vec3[] = Object.values(model.nodes).map((node) => [
    node.x,
    node.y,
    node.z,
  ]);
  let normal: Vec3 | null = null;
  const first = points[0];
  if (!first) {
    normal = [0, 0, 1];
  } else {
    const diff = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a: Vec3, b: Vec3): Vec3 => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

    // Punto más lejano al primero: define la dirección principal.
    let far = first;
    for (const point of points) {
      if (length(diff(point, first)) > length(diff(far, first))) far = point;
    }
    const direction = diff(far, first);
    const size = length(direction);

    // Punto más alejado de esa recta: define el plano.
    let best: Vec3 = [0, 0, 0];
    for (const point of points) {
      const candidate = cross(direction, diff(point, first));
      if (length(candidate) > length(best)) best = candidate;
    }
    const tolerance = Math.max(size, 1e-12) * 1e-6;

    if (size < 1e-12 || length(best) / Math.max(size, 1e-12) < tolerance) {
      normal = [0, 0, 1];
    } else {
      const bestLength = length(best);
      const unit: Vec3 = [best[0] / bestLength, best[1] / bestLength, best[2] / bestLength];
      const planar = points.every((point) => {
        const offset = diff(point, first);
        return Math.abs(offset[0] * unit[0] + offset[1] * unit[1] + offset[2] * unit[2]) <= tolerance;
      });
      normal = planar ? unit : null;
    }
  }

  PLANE_NORMALS.set(model, { normal });
  return normal;
}

/**
 * Eje local sobre el que se dibujan N y T (que actúan a lo largo de la barra
 * y por eso se abaten). En modelos planos se usa el eje perpendicular a la
 * barra contenido en el plano del modelo, para que el diagrama se vea en la
 * vista del plano; en modelos 3D, el eje local z.
 */
export function axialPlotAxis(model: PymasModel, frame: FrameData): LocalAxis {
  const normal = modelPlaneNormal(model);
  if (!normal) return FORCE_PLOT_AXIS.fx;
  const along = (axis: Vec3) =>
    Math.abs(axis[0] * normal[0] + axis[1] * normal[1] + axis[2] * normal[2]);
  return along(frame.localAxes.y) <= along(frame.localAxes.z) ? "y" : "z";
}

export function diagramAxis(component: DiagramComponent, kind = diagramKindOf(component)): LocalAxis {
  if (kind === "force") {
    return FORCE_PLOT_AXIS[component as ForceComponent] ?? "y";
  }
  return DISPLACEMENT_PLOT_AXIS[component as DisplacementComponent] ?? "x";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeScale(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 1;
}

function safeStations(stations: number[] | undefined): number[] {
  if (!Array.isArray(stations) || stations.length === 0) {
    return [...DEFAULT_DIAGRAM_STATIONS];
  }
  if (!stations.every(isFiniteNumber)) return [...DEFAULT_DIAGRAM_STATIONS];
  return [...stations];
}

function seriesValues(
  series: FrameStationForces | FrameStationDisplacements,
  component: DiagramComponent,
  count: number,
): number[] {
  const raw = (series as unknown as Record<string, unknown>)[component];
  if (!Array.isArray(raw)) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, index) => {
    const value = raw[index];
    return isFiniteNumber(value) ? value : 0;
  });
}

function axisVectorOf(frame: FrameData, axis: LocalAxis): Vec3 {
  const vector = frame.localAxes[axis];
  return [vector[0], vector[1], vector[2]];
}

function peakAt(
  stations: number[],
  values: number[],
  points: Vec3[],
  displayPoints: Vec3[],
  index: number,
): DiagramPeak {
  const value = values[index] ?? 0;
  return {
    value,
    absValue: Math.abs(value),
    station: stations[index] ?? 0,
    index,
    position: points[index] ?? [0, 0, 0],
    display: displayPoints[index] ?? [0, 0, 0],
    end:
      index === 0
        ? "i"
        : index === values.length - 1
          ? "j"
          : "interior",
  };
}

function peaks(
  stations: number[],
  values: number[],
  points: Vec3[],
  displayPoints: Vec3[],
): Pick<DiagramSeries, "min" | "max" | "absMax"> {
  if (values.length === 0) {
    const zero = peakAt([0], [0], [[0, 0, 0]], [[0, 0, 0]], 0);
    return { min: zero, max: zero, absMax: zero };
  }

  let minIndex = 0;
  let maxIndex = 0;
  let absIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (value < (values[minIndex] ?? 0)) minIndex = index;
    if (value > (values[maxIndex] ?? 0)) maxIndex = index;
    if (Math.abs(value) > Math.abs(values[absIndex] ?? 0)) absIndex = index;
  }

  return {
    min: peakAt(stations, values, points, displayPoints, minIndex),
    max: peakAt(stations, values, points, displayPoints, maxIndex),
    absMax: peakAt(stations, values, points, displayPoints, absIndex),
  };
}

export function buildFrameDiagram(
  model: PymasModel,
  result: PatternResultData,
  frameId: string,
  component: DiagramComponent,
  scaleFactor = 1,
): DiagramSeries {
  const frame = model.frames[frameId];
  if (!frame) throw new MissingFrameError(frameId);

  const frameResult = result.frameResults[frameId];
  if (!frameResult) throw new MissingFrameResultError(frameId);

  const kind = diagramKindOf(component);
  const series =
    kind === "force" ? frameResult.internalForces : frameResult.internalDisplacements;
  const stations = safeStations(series.stations);
  const values = seriesValues(series, component, stations.length);
  const factor = safeScale(scaleFactor);

  const { p1, p2 } = framePositions(frame, model.nodes);
  const points = stations.map((station) => pointAtStation(p1, p2, station));
  const axis =
    component === "fx" || component === "mx"
      ? axialPlotAxis(model, frame)
      : diagramAxis(component, kind);
  const axisVector = axisVectorOf(frame, axis);
  const offsets = values.map((value) => scale(axisVector, value * factor));
  const displayPoints = points.map((point, index) => add(point, offsets[index] ?? [0, 0, 0]));

  return {
    frameId,
    kind,
    component,
    axis,
    axisVector,
    scale: factor,
    stations,
    values,
    points,
    offsets,
    displayPoints,
    ...peaks(stations, values, points, displayPoints),
    hasExplicitStations: series.hasExplicitStations,
  };
}

export function buildFrameDiagrams(
  model: PymasModel,
  result: PatternResultData,
  frameId: string,
  kind: DiagramKind = "force",
  scaleFactor = 1,
): DiagramSeries[] {
  const components: readonly DiagramComponent[] =
    kind === "force" ? FORCE_COMPONENTS : DISPLACEMENT_COMPONENTS;
  return components.map((component) =>
    buildFrameDiagram(model, result, frameId, component, scaleFactor),
  );
}

function interpolateSeries(stations: number[], values: number[], station: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1 || stations.length !== values.length) return values[0] ?? 0;
  const first = stations[0] ?? 0;
  const last = stations[stations.length - 1] ?? 1;
  if (station <= first) return values[0] ?? 0;
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

function interpolatePoint(points: Vec3[], stations: number[], station: number): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  if (points.length === 1 || stations.length !== points.length) return points[0] ?? [0, 0, 0];
  const first = stations[0] ?? 0;
  const last = stations[stations.length - 1] ?? 1;
  if (station <= first) return points[0] ?? [0, 0, 0];
  if (station >= last) return points[points.length - 1] ?? [0, 0, 0];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const x0 = stations[index];
    const x1 = stations[index + 1];
    if (x0 === undefined || x1 === undefined) continue;
    if (station >= x0 && station <= x1) {
      const p0 = points[index] ?? [0, 0, 0];
      const p1 = points[index + 1] ?? [0, 0, 0];
      if (Math.abs(x1 - x0) < 1e-15) return p1;
      const t = (station - x0) / (x1 - x0);
      return [
        p0[0] + t * (p1[0] - p0[0]),
        p0[1] + t * (p1[1] - p0[1]),
        p0[2] + t * (p1[2] - p0[2]),
      ];
    }
  }
  return points[points.length - 1] ?? [0, 0, 0];
}

/**
 * Interpola linealmente una serie en una coordenada normalizada 0..1.
 * Fuera de rango devuelve el valor del extremo (útil para el cursor 2D de la
 * Fase 4).
 */
export function sampleDiagram(series: DiagramSeries, station: number): DiagramSample {
  const value = interpolateSeries(series.stations, series.values, station);
  const position = interpolatePoint(series.points, series.stations, station);
  const offset = scale(series.axisVector, value * series.scale);
  return {
    station,
    value,
    position,
    offset,
    display: add(position, offset),
  };
}

/**
 * Escala automática: la ordenada máxima de todas las acciones internas consideradas
 * ocupa una fracción de la diagonal del modelo.  Devuelve 1 si no hay datos.
 */
export function autoDiagramScale(
  model: PymasModel,
  result: PatternResultData,
  options: AutoDiagramScaleOptions = {},
): number {
  const targetFraction = isFiniteNumber(options.targetFraction)
    ? Math.abs(options.targetFraction)
    : 0.12;
  const components = options.components ?? FORCE_COMPONENTS;
  const frameIds = options.frames ?? Object.keys(result.frameResults);
  const target = modelBounds(model).diagonal * targetFraction;

  let maxAbs = 0;
  for (const frameId of frameIds) {
    const frameResult = result.frameResults[frameId];
    if (!frameResult) continue;
    for (const component of components) {
      const values = frameResult.internalForces[component];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        if (isFiniteNumber(value) && Math.abs(value) > maxAbs) {
          maxAbs = Math.abs(value);
        }
      }
    }
  }

  return maxAbs > 0 && Number.isFinite(maxAbs) ? target / maxAbs : 1;
}
