import type {
  Displacement6D,
  DOF,
  FrameData,
  FrameResultData,
  FrameStationDisplacements,
  FrameStationForces,
  LoadCombinationData,
  LoadCombinationType,
  LoadPatternData,
  LocalAxes,
  MaterialData,
  NodalLoad,
  NodeData,
  PatternResultData,
  PymasJson,
  PymasModel,
  ReleaseData,
  ReleaseFlags,
  SectionData,
  SupportData,
  SupportKind,
  Vector6D,
} from "../types/pymas";
import {
  asVec3,
  axesAreOrthonormal,
  computeLocalAxes,
  distance,
  distributedLoadMagnitude,
  isFiniteNumber,
  localAxesFromUnknown,
  nodePosition,
  type Vec3,
} from "./geometry";

const ALL_DOFS: DOF[] = ["ux", "uy", "uz", "rx", "ry", "rz"];
const DEFAULT_STATIONS = [0, 0.25, 0.5, 0.75, 1];
const DEFAULT_UNITS = { force: "kN", length: "m", stress: "kPa" };

type Obj = Record<string, unknown>;

export class PymasParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PymasParseError";
  }
}

function isRecord(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function optionalNum(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  return fallback;
}

function pick(obj: Obj, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function pickString(obj: Obj, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(obj[key]);
    if (value) return value;
  }
  return undefined;
}

function entityEntries(
  raw: unknown,
  label: string,
  warnings: string[],
): Array<{ key: string; value: Obj }> {
  if (Array.isArray(raw)) {
    const out: Array<{ key: string; value: Obj }> = [];
    raw.forEach((item, index) => {
      if (!isRecord(item)) {
        warnings.push(`${label}: se ignoró el elemento ${index + 1} (no es un objeto).`);
        return;
      }
      const key =
        pickString(item, ["id", "name", "label"]) ?? `${label.replace(/s$/, "")}${index + 1}`;
      out.push({ key, value: item });
    });
    return out;
  }
  if (isRecord(raw)) {
    const out: Array<{ key: string; value: Obj }> = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!isRecord(value)) {
        warnings.push(`${label}: se ignoró "${key}" (no es un objeto).`);
        continue;
      }
      out.push({ key, value });
    }
    return out;
  }
  return [];
}

function normalizeDofs(raw: unknown, modelType: string, dofPerNode?: number): DOF[] {
  const valid = new Set<string>(ALL_DOFS);
  if (Array.isArray(raw)) {
    const dofs = raw
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
      .filter((item): item is DOF => valid.has(item));
    const unique = [...new Set(dofs)];
    if (unique.length > 0) return unique;
  }
  const type = modelType.toLowerCase();
  if (type.includes("truss")) return ["ux", "uy", "uz"];
  if (type === "beam" || type.includes("beam")) return ["uy", "rz"];
  if (type === "bar" || type.includes("bar")) return ["ux"];
  if (isFiniteNumber(dofPerNode) && dofPerNode > 0) {
    return ALL_DOFS.slice(0, Math.min(6, Math.max(1, Math.round(dofPerNode))));
  }
  return [...ALL_DOFS];
}

function normalizeUnits(
  raw: unknown,
  warnings: string[],
): { units: { force: string; length: string; stress: string }; assumed: boolean } {
  if (!isRecord(raw)) {
    warnings.push("El JSON no declara `units`; se asumen kN, m y kPa.");
    return { units: { ...DEFAULT_UNITS }, assumed: true };
  }
  const force = str(raw.force);
  const lengthUnit = str(raw.length);
  const stress = str(raw.stress);
  if (!force && !lengthUnit && !stress) {
    warnings.push("El bloque `units` está vacío; se asumen kN, m y kPa.");
    return { units: { ...DEFAULT_UNITS }, assumed: true };
  }
  return {
    units: {
      force: force ?? DEFAULT_UNITS.force,
      length: lengthUnit ?? DEFAULT_UNITS.length,
      stress: stress ?? DEFAULT_UNITS.stress,
    },
    assumed: !force || !lengthUnit || !stress,
  };
}

function makeReleaseFlags(): ReleaseFlags {
  return {
    axial: false,
    shear_y: false,
    shear_z: false,
    torsion: false,
    bending_y: false,
    bending_z: false,
  };
}

function parseReleaseFlags(raw: unknown): ReleaseFlags {
  const flags = makeReleaseFlags();
  if (!isRecord(raw)) return flags;
  for (const key of Object.keys(flags) as Array<keyof ReleaseFlags>) {
    const value = raw[key];
    if (value !== undefined) flags[key] = bool(value);
  }
  return flags;
}

function mergeReleaseFlags(
  target: ReleaseFlags,
  source: Partial<ReleaseFlags> | undefined,
): void {
  if (!source) return;
  for (const key of Object.keys(target) as Array<keyof ReleaseFlags>) {
    if (source[key] === true) target[key] = true;
  }
}

function hasAnyRelease(flags: ReleaseFlags): boolean {
  return Object.values(flags).some(Boolean);
}

function normalizeNodalLoad(raw: unknown): NodalLoad {
  const obj = isRecord(raw) ? raw : {};
  return {
    fx: num(pick(obj, ["fx", "Fx", "FX"]), 0),
    fy: num(pick(obj, ["fy", "Fy", "FY"]), 0),
    fz: num(pick(obj, ["fz", "Fz", "FZ"]), 0),
    mx: num(pick(obj, ["mx", "Mx", "MX"]), 0),
    my: num(pick(obj, ["my", "My", "MY"]), 0),
    mz: num(pick(obj, ["mz", "Mz", "MZ"]), 0),
  };
}

function normalizeDistributedLoad(raw: unknown, warnings: string[], context: string): {
  load: {
    type: string;
    coordinateSystem: "local" | "global";
    direction?: string;
    fx: number;
    fy: number;
    fz: number;
  };
  magnitude: number;
} {
  const obj = isRecord(raw) ? raw : {};
  const type = str(pick(obj, ["type", "load_type", "kind"])) ?? "DistributedLoad";
  const direction = str(pick(obj, ["direction", "dir", "axis"]));
  const explicitSystem = str(
    pick(obj, ["coordinate_system", "coordinateSystem", "system"]),
  )?.toLowerCase();
  const coordinateSystem =
    explicitSystem === "global" ||
    (direction !== undefined && direction.toLowerCase().startsWith("global"))
      ? "global"
      : "local";

  let fx = num(pick(obj, ["fx", "wx", "qx", "Fx"]), 0);
  let fy = num(pick(obj, ["fy", "wy", "qy", "Fy"]), 0);
  let fz = num(pick(obj, ["fz", "wz", "qz", "Fz"]), 0);

  // Variante del contrato original: direction: "global_z" + w: valor.
  const w = optionalNum(pick(obj, ["w", "q", "value"]));
  if (w !== undefined && fx === 0 && fy === 0 && fz === 0 && direction) {
    const d = direction.toLowerCase();
    if (d.endsWith("_x")) fx = w;
    else if (d.endsWith("_y")) fy = w;
    else if (d.endsWith("_z")) fz = w;
  }

  if (type !== "DistributedLoad" && type !== "UniformLoad") {
    warnings.push(`${context}: tipo de carga de barra no reconocido "${type}" (se conserva).`);
  }

  return {
    load: {
      type,
      coordinateSystem,
      ...(direction ? { direction } : {}),
      fx,
      fy,
      fz,
    },
    magnitude: Math.hypot(fx, fy, fz),
  };
}

function normalizeStations(raw: unknown, dataLength: number): {
  stations: number[];
  explicit: boolean;
} {
  if (Array.isArray(raw)) {
    const stations = raw
      .map((value) => (typeof value === "number" ? value : Number(value)))
      .filter((value) => Number.isFinite(value));
    if (stations.length === dataLength && stations.length > 0) {
      return { stations, explicit: true };
    }
    if (stations.length > 0) {
      // No forzamos datos incongruentes: la serie se muestrea equidistantemente.
      return { stations: linspace(dataLength), explicit: false };
    }
  }
  if (dataLength === 5) return { stations: [...DEFAULT_STATIONS], explicit: false };
  if (dataLength > 0) return { stations: linspace(dataLength), explicit: false };
  return { stations: [...DEFAULT_STATIONS], explicit: false };
}

function linspace(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => i / (n - 1));
}

function readSeries(raw: unknown, key: string, lengthHint: number): number[] {
  if (!isRecord(raw)) return Array.from({ length: lengthHint }, () => 0);
  const value = raw[key];
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0));
  }
  return Array.from({ length: lengthHint }, () => 0);
}

function seriesLength(raw: unknown, keys: string[]): number {
  if (!isRecord(raw)) return 0;
  let max = 0;
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) max = Math.max(max, value.length);
  }
  return max;
}

function normalizeStationForces(raw: unknown, context: string, warnings: string[]): FrameStationForces {
  const obj = isRecord(raw) ? raw : {};
  const len = seriesLength(obj, ["fx", "fy", "fz", "mx", "my", "mz"]);
  const { stations, explicit } = normalizeStations(obj.stations, len);
  for (const key of ["fx", "fy", "fz", "mx", "my", "mz"] as const) {
    const value = obj[key];
    if (Array.isArray(value) && value.length !== len && len > 0) {
      warnings.push(`${context}: la serie ${key} tiene longitud distinta al resto.`);
    }
  }
  return {
    stations,
    fx: readSeries(obj, "fx", len),
    fy: readSeries(obj, "fy", len),
    fz: readSeries(obj, "fz", len),
    mx: readSeries(obj, "mx", len),
    my: readSeries(obj, "my", len),
    mz: readSeries(obj, "mz", len),
    hasExplicitStations: explicit,
  };
}

function normalizeStationDisplacements(
  raw: unknown,
  context: string,
  warnings: string[],
): FrameStationDisplacements {
  const obj = isRecord(raw) ? raw : {};
  const len = seriesLength(obj, ["ux", "uy", "uz", "rx", "ry", "rz"]);
  const { stations, explicit } = normalizeStations(obj.stations, len);
  for (const key of ["ux", "uy", "uz", "rx", "ry", "rz"] as const) {
    const value = obj[key];
    if (Array.isArray(value) && value.length !== len && len > 0) {
      warnings.push(`${context}: la serie ${key} tiene longitud distinta al resto.`);
    }
  }
  return {
    stations,
    ux: readSeries(obj, "ux", len),
    uy: readSeries(obj, "uy", len),
    uz: readSeries(obj, "uz", len),
    rx: readSeries(obj, "rx", len),
    ry: readSeries(obj, "ry", len),
    rz: readSeries(obj, "rz", len),
    hasExplicitStations: explicit,
  };
}

const VECTOR_KEYS = ["fx", "fy", "fz", "mx", "my", "mz"] as const;

function parseVector6(raw: unknown): Vector6D {
  const obj = isRecord(raw) ? raw : {};
  return {
    fx: num(obj.fx, 0),
    fy: num(obj.fy, 0),
    fz: num(obj.fz, 0),
    mx: num(obj.mx, 0),
    my: num(obj.my, 0),
    mz: num(obj.mz, 0),
  };
}

function parseDisplacement6(raw: unknown): Displacement6D {
  const obj = isRecord(raw) ? raw : {};
  return {
    ux: num(obj.ux, 0),
    uy: num(obj.uy, 0),
    uz: num(obj.uz, 0),
    rx: num(obj.rx, 0),
    ry: num(obj.ry, 0),
    rz: num(obj.rz, 0),
  };
}

/**
 * Las acciones de extremo reales de pymas son planas:
 *   fx_j ... mz_j  (extremo I)   y   fx_k ... mz_k  (extremo J)
 * El contrato del plano usa { i: {...}, j: {...} }.
 */
function parseEndActions(raw: unknown): { i: Vector6D; j: Vector6D } {
  const obj = isRecord(raw) ? raw : {};
  const nestedI = isRecord(obj.i) ? obj.i : isRecord(obj.I) ? obj.I : undefined;
  const nestedJ = isRecord(obj.j) ? obj.j : isRecord(obj.J) ? obj.J : undefined;
  if (nestedI || nestedJ) {
    return { i: parseVector6(nestedI), j: parseVector6(nestedJ) };
  }

  const hasK = VECTOR_KEYS.some((key) => obj[`${key}_k`] !== undefined);
  const hasI = VECTOR_KEYS.some((key) => obj[`${key}_i`] !== undefined);
  const iSuffix = hasK ? "_j" : hasI ? "_i" : "_j";
  const jSuffix = hasK ? "_k" : hasI ? "_j" : "_k";
  const iObj: Obj = {};
  const jObj: Obj = {};
  for (const key of VECTOR_KEYS) {
    iObj[key] = obj[`${key}${iSuffix}`];
    jObj[key] = obj[`${key}${jSuffix}`];
  }
  return { i: parseVector6(iObj), j: parseVector6(jObj) };
}

function collectMapEntries(raw: unknown): Array<{ key: string; value: unknown }> {
  if (Array.isArray(raw)) {
    return raw.map((value, index) => {
      const obj = isRecord(value) ? value : {};
      const key =
        pickString(obj, ["joint", "node", "node_id", "frame", "element", "id"]) ??
        String(index);
      return { key, value };
    });
  }
  if (isRecord(raw)) {
    return Object.entries(raw).map(([key, value]) => ({ key, value }));
  }
  return [];
}

function normalizeNodalResultMap(raw: unknown): Record<string, Displacement6D> {
  const out: Record<string, Displacement6D> = {};
  for (const { key, value } of collectMapEntries(raw)) {
    const obj = isRecord(value) ? value : {};
    const node = pickString(obj, ["joint", "node", "node_id"]) ?? key;
    out[node] = parseDisplacement6(obj);
  }
  return out;
}

function normalizeVectorResultMap(raw: unknown): Record<string, Vector6D> {
  const out: Record<string, Vector6D> = {};
  for (const { key, value } of collectMapEntries(raw)) {
    const obj = isRecord(value) ? value : {};
    const node = pickString(obj, ["joint", "node", "node_id"]) ?? key;
    out[node] = parseVector6(obj);
  }
  return out;
}

function normalizeFrameResult(raw: unknown, context: string, warnings: string[]): FrameResultData {
  const obj = isRecord(raw) ? raw : {};
  const endRaw = pick(obj, ["end_actions", "endActions", "end_action"]) ?? {};
  const forcesRaw = pick(obj, ["internal_forces", "internalForces", "forces"]) ?? {};
  const dispRaw = pick(obj, [
    "internal_displacements",
    "internalDisplacements",
    "displacements",
  ]) ?? {};
  return {
    endActions: parseEndActions(endRaw),
    internalForces: normalizeStationForces(forcesRaw, `${context} / internal_forces`, warnings),
    internalDisplacements: normalizeStationDisplacements(
      dispRaw,
      `${context} / internal_displacements`,
      warnings,
    ),
  };
}

function normalizePatternResults(raw: unknown, warnings: string[]): PatternResultData {
  const obj = isRecord(raw) ? raw : {};
  const displacementRaw = pick(obj, ["nodal_displacements", "nodalDisplacements", "displacements"]);
  const reactionRaw = pick(obj, ["reactions", "reaction"]);
  const frameRaw = pick(obj, ["frame_results", "frameResults", "frames"]);
  const frameResults: Record<string, FrameResultData> = {};

  for (const { key, value } of collectMapEntries(frameRaw)) {
    const frameId =
      (isRecord(value) ? pickString(value, ["frame", "element", "id"]) : undefined) ?? key;
    frameResults[frameId] = normalizeFrameResult(value, `results/${frameId}`, warnings);
  }

  return {
    nodalDisplacements: normalizeNodalResultMap(displacementRaw),
    reactions: normalizeVectorResultMap(reactionRaw),
    frameResults,
  };
}

function collectNodalLoads(raw: unknown): Array<{ node: string; load: unknown }> {
  const out: Array<{ node: string; load: unknown }> = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const obj = isRecord(item) ? item : {};
      const node = pickString(obj, ["joint", "node", "node_id"]);
      if (node) out.push({ node, load: item });
    }
    return out;
  }
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const obj = isRecord(item) ? item : {};
          const node = pickString(obj, ["joint", "node", "node_id"]) ?? key;
          out.push({ node, load: item });
        }
      } else {
        const obj = isRecord(value) ? value : {};
        const node = pickString(obj, ["joint", "node", "node_id"]) ?? key;
        out.push({ node, load: value });
      }
    }
  }
  return out;
}

function collectFrameLoads(raw: unknown): Array<{ frame: string; load: unknown }> {
  const out: Array<{ frame: string; load: unknown }> = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const obj = isRecord(item) ? item : {};
      const frame = pickString(obj, ["frame", "element", "frame_id"]);
      if (frame) out.push({ frame, load: item });
    }
    return out;
  }
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const obj = isRecord(item) ? item : {};
          const frame = pickString(obj, ["frame", "element", "frame_id"]) ?? key;
          out.push({ frame, load: item });
        }
      } else {
        const obj = isRecord(value) ? value : {};
        const frame = pickString(obj, ["frame", "element", "frame_id"]) ?? key;
        out.push({ frame, load: value });
      }
    }
  }
  return out;
}

function supportKind(translationCount: number, rotationCount: number): SupportKind {
  if (translationCount === 0 && rotationCount === 0) return "free";
  if (rotationCount > 0 && translationCount > 0) return "fixed";
  if (translationCount >= 3) return "pinned";
  if (translationCount > 0) return "roller";
  return "rotational";
}

function sectionFallbackDimensions(A: number): { dy: number; dz: number } {
  const side = A > 0 ? Math.sqrt(A) : 0.1;
  const safe = Number.isFinite(side) && side > 1e-6 ? side : 0.1;
  return { dy: safe, dz: safe };
}

export interface ParseOptions {
  /** Nombre de archivo, URL o etiqueta para mostrar en la UI. */
  source?: string;
}

/**
 * Normaliza un objeto JSON de pymas al modelo interno.
 *
 * Es deliberadamente tolerante: acepta tanto el esquema real (`type`,
 * `joints`, `joint_j`, `r_ux`, ...) como el contrato inicial del plano
 * (`model`, `nodes`, `node_i`, `ux`, ...). Los problemas no fatales se
 * acumulan en `warnings`; sólo una entrada sin nudos/estructura válida lanza
 * `PymasParseError`.
 */
export function parsePymasModel(input: unknown, options: ParseOptions = {}): PymasModel {
  if (!isRecord(input)) {
    throw new PymasParseError("El archivo no contiene un objeto JSON de modelo.");
  }
  const raw = input as PymasJson;
  const warnings: string[] = [];
  const metaRaw = isRecord(raw.model) ? raw.model : undefined;

  const modelType =
    str(pick(metaRaw ?? {}, ["type"])) ??
    str(raw.type) ??
    "space_frame";
  const dofRaw = raw.degrees_of_freedom ?? metaRaw?.degrees_of_freedom;
  const dofPerNodeMeta = optionalNum(metaRaw?.dof_per_node);
  const degreesOfFreedom = normalizeDofs(dofRaw, modelType, dofPerNodeMeta);
  const unitsRaw = raw.units ?? metaRaw?.units;
  const { units, assumed } = normalizeUnits(unitsRaw, warnings);
  const sourceName = options.source ?? str(metaRaw?.name) ?? str(raw.name) ?? "modelo";
  const modelName =
    str(metaRaw?.name) ??
    str(raw.name) ??
    sourceName.replace(/\.json$/i, "").replace(/^.*[\\/]/, "");

  // -------------------------------------------------------------------------
  // Nudos
  // -------------------------------------------------------------------------
  const nodeEntries = [
    ...entityEntries(raw.nodes, "nodes", warnings),
    ...entityEntries(raw.joints, "joints", warnings),
  ];
  const nodes: Record<string, NodeData> = {};
  const nodeOrder: string[] = [];
  for (const { key, value } of nodeEntries) {
    const id = pickString(value, ["id", "name"]) ?? key;
    if (nodes[id]) warnings.push(`Nudo duplicado "${id}"; se conserva el último valor.`);
    const x = num(value.x, Number.NaN);
    const y = num(value.y, 0);
    const z = num(value.z, 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      warnings.push(`Nudo "${id}": coordenadas no finitas; se usan 0 donde falte.`);
    }
    nodes[id] = {
      id,
      name: str(value.name) ?? id,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      z: Number.isFinite(z) ? z : 0,
    };
    if (!nodeOrder.includes(id)) nodeOrder.push(id);
  }
  if (nodeOrder.length === 0) {
    throw new PymasParseError("El modelo no contiene nudos (`joints`/`nodes`).");
  }

  // -------------------------------------------------------------------------
  // Apoyos
  // -------------------------------------------------------------------------
  const supports: Record<string, SupportData> = {};
  for (const { key, value } of entityEntries(raw.supports, "supports", warnings)) {
    const nodeId = pickString(value, ["joint", "node", "node_id", "id"]) ?? key;
    if (!nodes[nodeId]) {
      warnings.push(`Apoyo "${key}": referencia al nudo inexistente "${nodeId}".`);
      continue;
    }
    const restraints = isRecord(value.restraints) ? value.restraints : value;
    const ux = bool(pick(restraints, ["r_ux", "ux", "restrain_ux"]));
    const uy = bool(pick(restraints, ["r_uy", "uy", "restrain_uy"]));
    const uz = bool(pick(restraints, ["r_uz", "uz", "restrain_uz"]));
    const rx = bool(pick(restraints, ["r_rx", "rx", "restrain_rx"]));
    const ry = bool(pick(restraints, ["r_ry", "ry", "restrain_ry"]));
    const rz = bool(pick(restraints, ["r_rz", "rz", "restrain_rz"]));
    const translationCount = [ux, uy, uz].filter(Boolean).length;
    const rotationCount = [rx, ry, rz].filter(Boolean).length;
    supports[nodeId] = {
      id: str(value.id) ?? key,
      node: nodeId,
      ux,
      uy,
      uz,
      rx,
      ry,
      rz,
      translationCount,
      rotationCount,
      kind: supportKind(translationCount, rotationCount),
    };
  }

  // -------------------------------------------------------------------------
  // Materiales
  // -------------------------------------------------------------------------
  const materials: Record<string, MaterialData> = {};
  for (const { key, value } of entityEntries(raw.materials, "materials", warnings)) {
    const id = pickString(value, ["id", "name"]) ?? key;
    const E = num(value.E, 0);
    const hasNu = optionalNum(value.nu) !== undefined;
    const hasRho = optionalNum(value.rho) !== undefined;
    const nu = hasNu ? num(value.nu, 0.3) : 0.3;
    const rho = hasRho ? num(value.rho, 0) : 0;
    const explicitG = optionalNum(value.G);
    const G = explicitG ?? (E > 0 ? E / (2 * (1 + nu)) : 0);
    if (!(E > 0)) warnings.push(`Material "${id}": E ausente o nulo.`);
    materials[id] = {
      id,
      name: str(value.name) ?? id,
      E,
      G,
      nu,
      rho,
      hasG: explicitG !== undefined,
      hasNu,
      hasRho,
    };
  }

  // -------------------------------------------------------------------------
  // Secciones
  // -------------------------------------------------------------------------
  const sections: Record<string, SectionData> = {};
  for (const { key, value } of entityEntries(raw.sections, "sections", warnings)) {
    const id = pickString(value, ["id", "name"]) ?? key;
    const type = str(value.type) ?? "Section";
    const rawDy = optionalNum(value.dy);
    const rawDz = optionalNum(value.dz);
    const explicitDimensions =
      rawDy !== undefined && rawDy > 0 && rawDz !== undefined && rawDz > 0;
    const computedA =
      optionalNum(value.A) ?? (explicitDimensions ? (rawDy as number) * (rawDz as number) : 0);
    const fallback = sectionFallbackDimensions(computedA);
    const dy = explicitDimensions ? (rawDy as number) : fallback.dy;
    const dz = explicitDimensions ? (rawDz as number) : fallback.dz;
    sections[id] = {
      id,
      name: str(value.name) ?? id,
      type,
      dy,
      dz,
      A: computedA,
      Iy: num(value.Iy, 0),
      Iz: num(value.Iz, 0),
      J: num(value.J, 0),
      explicitDimensions,
      isRectangular: /rect/i.test(type) || explicitDimensions,
    };
  }

  // -------------------------------------------------------------------------
  // Definiciones de liberación (contrato original)
  // -------------------------------------------------------------------------
  const releases: Record<string, ReleaseData> = {};
  for (const { key, value } of entityEntries(raw.releases, "releases", warnings)) {
    const id = pickString(value, ["id", "name"]) ?? key;
    const flags = parseReleaseFlags(value);
    releases[id] = {
      id,
      name: str(value.name) ?? id,
      ...flags,
    };
  }

  const releaseForReference = (
    reference: unknown,
    context: string,
  ): ReleaseFlags | undefined => {
    if (typeof reference === "string" && reference.length > 0) {
      const release = releases[reference];
      if (!release) {
        warnings.push(`${context}: referencia a liberación inexistente "${reference}".`);
        return undefined;
      }
      return {
        axial: release.axial,
        shear_y: release.shear_y,
        shear_z: release.shear_z,
        torsion: release.torsion,
        bending_y: release.bending_y,
        bending_z: release.bending_z,
      };
    }
    if (isRecord(reference)) return parseReleaseFlags(reference);
    return undefined;
  };

  // -------------------------------------------------------------------------
  // Barras
  // -------------------------------------------------------------------------
  const frames: Record<string, FrameData> = {};
  const frameOrder: string[] = [];
  for (const { key, value } of entityEntries(raw.frames, "frames", warnings)) {
    const id = pickString(value, ["id", "name"]) ?? key;
    const nodesField = value.nodes;
    const pair = Array.isArray(nodesField) ? nodesField : undefined;
    const nodeI =
      pickString(value, ["node_i", "nodeI", "joint_i", "joint_j", "i", "start"]) ??
      (pair && typeof pair[0] === "string" ? pair[0] : undefined);
    const nodeJ =
      pickString(value, ["node_j", "nodeJ", "joint_k", "jointK", "j", "end"]) ??
      (pair && typeof pair[1] === "string" ? pair[1] : undefined);

    if (!nodeI || !nodeJ) {
      warnings.push(`Barra "${id}": no se encontraron los nudos inicial/final.`);
      continue;
    }
    if (!nodes[nodeI] || !nodes[nodeJ]) {
      warnings.push(
        `Barra "${id}": referencia a nudos inexistentes (${nodeI} → ${nodeJ}); se omite.`,
      );
      continue;
    }
    if (nodeI === nodeJ) {
      warnings.push(`Barra "${id}": nudo inicial y final coinciden; se omite.`);
      continue;
    }

    const materialId =
      pickString(value, ["material", "material_id", "materialId"]) ?? "";
    const sectionId = pickString(value, ["section", "section_id", "sectionId"]) ?? "";
    if (!materials[materialId] && materialId) {
      warnings.push(`Barra "${id}": material inexistente "${materialId}".`);
    }
    if (!sections[sectionId] && sectionId) {
      warnings.push(`Barra "${id}": sección inexistente "${sectionId}".`);
    }

    let rollAngle = num(pick(value, ["roll_angle", "rollAngle"]), 0);
    if (Math.abs(rollAngle) > 2 * Math.PI + 1e-9) {
      // El plano admite radianes o grados; los fixtures usan radianes (0).
      warnings.push(
        `Barra "${id}": roll_angle=${rollAngle} parece estar en grados; se convierte a radianes.`,
      );
      rollAngle = (rollAngle * Math.PI) / 180;
    }

    const p1 = nodePosition(nodes[nodeI]);
    const p2 = nodePosition(nodes[nodeJ]);
    const exportedAxes = localAxesFromUnknown(
      pick(value, ["local_axes", "localAxes", "axes"]),
    );
    let localAxes: LocalAxes;
    let localAxesSource: "exported" | "computed";
    if (exportedAxes && axesAreOrthonormal(exportedAxes)) {
      localAxes = exportedAxes;
      localAxesSource = "exported";
    } else {
      if (exportedAxes && !axesAreOrthonormal(exportedAxes)) {
        warnings.push(`Barra "${id}": local_axes no ortonormales; se recalculan.`);
      }
      localAxes = computeLocalAxes(p1, p2, rollAngle);
      localAxesSource = "computed";
    }

    const stiffnessRaw = isRecord(value.stiffness) ? value.stiffness : value;
    const stiffness = {
      axial: bool(pick(stiffnessRaw, ["axial"]), true),
      torsional: bool(pick(stiffnessRaw, ["torsional", "torsion"]), true),
      bending_y: bool(pick(stiffnessRaw, ["bending_y", "bendingY"]), true),
      bending_z: bool(pick(stiffnessRaw, ["bending_z", "bendingZ"]), true),
    };

    const releaseI = makeReleaseFlags();
    const releaseJ = makeReleaseFlags();
    const commonRelease = releaseForReference(
      pick(value, ["release", "release_id", "releaseId"]),
      `Barra "${id}"`,
    );
    mergeReleaseFlags(releaseI, commonRelease);
    mergeReleaseFlags(releaseJ, commonRelease);
    mergeReleaseFlags(
      releaseI,
      releaseForReference(
        pick(value, ["release_i", "releaseI", "release_start"]),
        `Barra "${id}" (I)`,
      ),
    );
    mergeReleaseFlags(
      releaseJ,
      releaseForReference(
        pick(value, ["release_j", "releaseJ", "release_end"]),
        `Barra "${id}" (J)`,
      ),
    );
    const endpointsRaw = isRecord(value.end_releases)
      ? value.end_releases
      : isRecord(value.releases)
        ? value.releases
        : undefined;
    if (endpointsRaw) {
      mergeReleaseFlags(releaseI, parseReleaseFlags(endpointsRaw.i ?? endpointsRaw.start));
      mergeReleaseFlags(releaseJ, parseReleaseFlags(endpointsRaw.j ?? endpointsRaw.end));
    }

    // pymas real codifica liberaciones como rigideces desactivadas.
    const derived: Partial<ReleaseFlags> = {
      ...(stiffness.axial === false ? { axial: true } : {}),
      ...(stiffness.torsional === false ? { torsion: true } : {}),
      ...(stiffness.bending_y === false ? { bending_y: true } : {}),
      ...(stiffness.bending_z === false ? { bending_z: true } : {}),
    };
    mergeReleaseFlags(releaseI, derived);
    mergeReleaseFlags(releaseJ, derived);

    const frameLoadsRaw = value.loads;
    const frameLoads: FrameData["loads"] = [];
    if (frameLoadsRaw !== undefined) {
      for (const item of Array.isArray(frameLoadsRaw) ? frameLoadsRaw : [frameLoadsRaw]) {
        const normalized = normalizeDistributedLoad(item, warnings, `Barra "${id}"`);
        if (normalized.magnitude > 0) frameLoads.push(normalized.load);
      }
    }

    frames[id] = {
      id,
      name: str(value.name) ?? id,
      nodeI,
      nodeJ,
      materialId,
      sectionId,
      rollAngle,
      localAxes,
      localAxesSource,
      stiffness,
      releaseI,
      releaseJ,
      loads: frameLoads,
      length: distance(p1, p2),
    };
    if (!frameOrder.includes(id)) frameOrder.push(id);
  }

  // -------------------------------------------------------------------------
  // Patrones de carga
  // -------------------------------------------------------------------------
  const loadPatterns: Record<string, LoadPatternData> = {};
  const loadPatternOrder: string[] = [];
  for (const { key, value } of entityEntries(raw.load_patterns, "load_patterns", warnings)) {
    const id = pickString(value, ["id", "name"]) ?? key;
    const name = str(value.name) ?? id;
    const nodalLoads: Record<string, NodalLoad> = {};
    const frameLoads: Record<string, FrameData["loads"]> = {};

    const nodalSources = [value.nodal_loads, value.joints];
    for (const source of nodalSources) {
      if (source === undefined) continue;
      for (const { node, load } of collectNodalLoads(source)) {
        if (!nodes[node]) {
          warnings.push(`Patrón "${id}": carga nodal en nudo inexistente "${node}".`);
          continue;
        }
        const normalized = normalizeNodalLoad(load);
        const current = nodalLoads[node] ?? {
          fx: 0,
          fy: 0,
          fz: 0,
          mx: 0,
          my: 0,
          mz: 0,
        };
        nodalLoads[node] = {
          fx: current.fx + normalized.fx,
          fy: current.fy + normalized.fy,
          fz: current.fz + normalized.fz,
          mx: current.mx + normalized.mx,
          my: current.my + normalized.my,
          mz: current.mz + normalized.mz,
        };
      }
    }

    const frameSources = [value.frame_loads, value.frames];
    for (const source of frameSources) {
      if (source === undefined) continue;
      for (const { frame, load } of collectFrameLoads(source)) {
        if (!frames[frame]) {
          warnings.push(`Patrón "${id}": carga distribuida en barra inexistente "${frame}".`);
          continue;
        }
        const normalized = normalizeDistributedLoad(load, warnings, `Patrón "${id}" / ${frame}`);
        if (normalized.magnitude === 0) continue;
        (frameLoads[frame] ??= []).push(normalized.load);
      }
    }

    loadPatterns[id] = { id, name, nodalLoads, frameLoads };
    if (!loadPatternOrder.includes(id)) loadPatternOrder.push(id);
  }

  // -------------------------------------------------------------------------
  // Combinaciones
  // -------------------------------------------------------------------------
  const loadCombinations: Record<string, LoadCombinationData> = {};
  const loadCombinationOrder: string[] = [];
  for (const { key, value } of entityEntries(
    raw.load_combinations,
    "load_combinations",
    warnings,
  )) {
    const id = pickString(value, ["id", "name"]) ?? key;
    const name = str(value.name) ?? id;
    const typeRaw = str(value.type)?.toLowerCase();
    const type: LoadCombinationType =
      typeRaw === "envelope" || typeRaw === "envolvente" ? "envelope" : "linear_add";
    const factors: Record<string, number> = {};
    if (isRecord(value.factors)) {
      for (const [patternId, factor] of Object.entries(value.factors)) {
        const numeric = num(factor, Number.NaN);
        if (Number.isFinite(numeric)) factors[patternId] = numeric;
      }
    } else {
      // Tolerancia por si el exportador escribe los factores en el nivel raíz.
      for (const [patternId, factor] of Object.entries(value)) {
        if (patternId === "id" || patternId === "name" || patternId === "type") continue;
        const numeric = optionalNum(factor);
        if (numeric !== undefined) factors[patternId] = numeric;
      }
    }
    for (const patternId of Object.keys(factors)) {
      if (!loadPatterns[patternId]) {
        warnings.push(
          `Combinación "${id}": el factor referencia el patrón inexistente "${patternId}".`,
        );
      }
    }
    loadCombinations[id] = { id, name, type, factors };
    if (!loadCombinationOrder.includes(id)) loadCombinationOrder.push(id);
  }

  // -------------------------------------------------------------------------
  // Resultados (patrones y, si existen, combinaciones precalculadas)
  // -------------------------------------------------------------------------
  const results: Record<string, PatternResultData> = {};
  const resultOrder: string[] = [];
  for (const { key, value } of entityEntries(raw.results, "results", warnings)) {
    results[key] = normalizePatternResults(value, warnings);
    resultOrder.push(key);
  }

  const stats = {
    nodes: nodeOrder.length,
    frames: frameOrder.length,
    supports: Object.keys(supports).length,
    materials: Object.keys(materials).length,
    sections: Object.keys(sections).length,
    releases: Object.keys(releases).length,
    patterns: loadPatternOrder.length,
    combinations: loadCombinationOrder.length,
    results: resultOrder.length,
  };

  return {
    meta: {
      name: modelName,
      type: modelType,
      dofPerNode: degreesOfFreedom.length,
      degreesOfFreedom,
      units,
      unitsAssumed: assumed,
      source: options.source ?? modelName,
    },
    nodes,
    nodeOrder,
    supports,
    materials,
    sections,
    releases,
    frames,
    frameOrder,
    loadPatterns,
    loadPatternOrder,
    loadCombinations,
    loadCombinationOrder,
    results,
    resultOrder,
    warnings: [...new Set(warnings)],
    stats,
  };
}

export function parsePymasJson(text: string, source?: string): PymasModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new PymasParseError(
      `El archivo no es JSON válido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parsePymasModel(parsed, { source });
}

export function hasReleases(frame: Pick<FrameData, "releaseI" | "releaseJ">): boolean {
  return hasAnyRelease(frame.releaseI) || hasAnyRelease(frame.releaseJ);
}

export function patternLoadCount(pattern: LoadPatternData): number {
  const nodal = Object.values(pattern.nodalLoads).filter(
    (load) =>
      load.fx !== 0 || load.fy !== 0 || load.fz !== 0 || load.mx !== 0 || load.my !== 0 || load.mz !== 0,
  ).length;
  const distributed = Object.values(pattern.frameLoads).reduce((acc, loads) => acc + loads.length, 0);
  return nodal + distributed;
}

export function frameDistributedMagnitude(_frame: FrameData, loads: FrameData["loads"]): number {
  return loads.reduce((acc, load) => acc + distributedLoadMagnitude(load), 0);
}

export function vec3Length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function safeVec3(value: unknown): Vec3 {
  return asVec3(value);
}
