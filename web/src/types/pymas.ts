/**
 * Tipos del contrato de datos de PyMAS y del modelo ya normalizado que usa la
 * aplicación.
 *
 * La auditoría de `fixtures/` (12 archivos, noviembre 2026) reveló que el
 * exportador real de pymas difiere en varios puntos del contrato inicial del
 * plano.  Los tipos de este archivo reflejan ambos mundos:
 *
 *  - Las interfaces `Raw*` / `PymasJson` describen el JSON tal como llega.
 *  - Las interfaces sin prefijo describen el modelo normalizado que consumen
 *    el parser, la escena 3D y los módulos de cálculo.
 *
 * Variaciones reales detectadas (ver informe de la Fase 1):
 *  - El nivel superior usa `type` + `degrees_of_freedom`, no `model`.
 *  - Los nudos se llaman `joints` (no `nodes`) y sólo tienen `x` en modelos 2D.
 *  - Las barras usan `joint_j` / `joint_k` (no `node_i` / `node_j`).
 *  - `supports` usa `r_ux`, `r_uy`, ... (no `ux`, `uy`, ...).
 *  - Los patrones agrupan cargas en `joints` / `frames` (no `nodal_loads` /
 *    `frame_loads`), y las cargas aportan sus propios `joint` / `frame`.
 *  - `end_actions` es plano (`fx_j`, `fy_j`, ..., `fx_k`, ...), no `{i,j}`.
 *  - `internal_forces` / `internal_displacements` son objetos planos con
 *    arrays y `stations` opcionales (0..1). F3 no exporta `stations` y usa
 *    cinco estaciones por defecto.
 *  - No aparecen `units`, `nu`, `rho`, `releases` ni `type` en combinaciones.
 *  - `load_combinations` sólo existe en F3 y siempre son lineales.
 *  - Los `local_axes` exportados pueden no coincidir con la convención
 *    geométrica del plano (caso `eiffel_tower.json`); se usan cuando existen.
 */

export type DOF = "ux" | "uy" | "uz" | "rx" | "ry" | "rz";

export interface PymasUnits {
  force: string;
  length: string;
  stress: string;
}

// ---------------------------------------------------------------------------
// JSON de entrada (tipos permisivos)
// ---------------------------------------------------------------------------

export type RawEntity = Record<string, unknown>;

export interface RawPymasModel {
  /** Metadatos del contrato original; en pymas real no existe. */
  model?: Record<string, unknown>;
  /** Tipo real en el nivel superior: space_frame | space_truss | beam | bar. */
  type?: string;
  /** Grados de libertad activos: ["ux","uy","uz","rx","ry","rz"] etc. */
  degrees_of_freedom?: unknown;
  units?: unknown;
  nodes?: unknown;
  joints?: unknown;
  supports?: unknown;
  materials?: unknown;
  sections?: unknown;
  releases?: unknown;
  frames?: unknown;
  load_patterns?: unknown;
  load_combinations?: unknown;
  results?: unknown;
  [key: string]: unknown;
}

/** Alias semántico: el JSON crudo que produce o acepta pymas. */
export type PymasJson = RawPymasModel;

// ---------------------------------------------------------------------------
// Modelo normalizado
// ---------------------------------------------------------------------------

export interface ModelMeta {
  name: string;
  /** space_frame | space_truss | beam | bar | string libre. */
  type: string;
  dofPerNode: number;
  degreesOfFreedom: DOF[];
  units: PymasUnits;
  /** true cuando el JSON no traía `units` y se aplicaron kN/m/kPa. */
  unitsAssumed: boolean;
  /** Etiqueta de origen (nombre de archivo, URL o "drag & drop"). */
  source: string;
}

export interface NodeData {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

export type SupportKind = "fixed" | "pinned" | "roller" | "rotational" | "free";

export interface SupportData {
  id: string;
  node: string;
  ux: boolean;
  uy: boolean;
  uz: boolean;
  rx: boolean;
  ry: boolean;
  rz: boolean;
  translationCount: number;
  rotationCount: number;
  kind: SupportKind;
}

export interface MaterialData {
  id: string;
  name: string;
  E: number;
  G: number;
  /** pymas real no exporta `nu`; por defecto 0.3. */
  nu: number;
  /** pymas real no exporta `rho`; por defecto 0. */
  rho: number;
  hasG: boolean;
  hasNu: boolean;
  hasRho: boolean;
}

export interface SectionData {
  id: string;
  name: string;
  /** RectangularSection | Section | string libre. */
  type: string;
  /**
   * Dimensiones de extrusión normalizadas.  Si el tipo `Section` no trae
   * `dy`/`dz` (barras de cercha), se deriva una dimensión visual desde `A`.
   */
  dy: number;
  dz: number;
  A: number;
  Iy: number;
  Iz: number;
  J: number;
  /** false => `dy`/`dz` son una estimación visual, no datos del exportador. */
  explicitDimensions: boolean;
  isRectangular: boolean;
}

export interface ReleaseData {
  id: string;
  name: string;
  axial: boolean;
  shear_y: boolean;
  shear_z: boolean;
  torsion: boolean;
  bending_y: boolean;
  bending_z: boolean;
}

export type ReleaseFlags = Omit<ReleaseData, "id" | "name">;

export interface LocalAxes {
  x: [number, number, number];
  y: [number, number, number];
  z: [number, number, number];
}

export type DistributedLoadCoordinateSystem = "local" | "global";

export interface DistributedLoad {
  type: string;
  /** pymas real: componentes locales. El contrato original admitía global_*. */
  coordinateSystem: DistributedLoadCoordinateSystem;
  /** Dirección original si venía en el JSON (global_x, local_y, ...). */
  direction?: string;
  fx: number;
  fy: number;
  fz: number;
}

export interface FrameData {
  id: string;
  name: string;
  nodeI: string;
  nodeJ: string;
  materialId: string;
  sectionId: string;
  /** Siempre en radianes en el modelo normalizado. */
  rollAngle: number;
  localAxes: LocalAxes;
  /** `exported` si pymas trajo `local_axes`; `computed` si se derivó. */
  localAxesSource: "exported" | "computed";
  stiffness: {
    axial: boolean;
    torsional: boolean;
    bending_y: boolean;
    bending_z: boolean;
  };
  /** Rótulas/liberaciones en el extremo I (nudo `joint_j`). */
  releaseI: ReleaseFlags;
  /** Rótulas/liberaciones en el extremo J (nudo `joint_k`). */
  releaseJ: ReleaseFlags;
  /** Cargas adheridas a la barra (contrato original `frame.loads`). */
  loads: DistributedLoad[];
  length: number;
}

export interface NodalLoad {
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

export interface LoadPatternData {
  id: string;
  name: string;
  nodalLoads: Record<string, NodalLoad>;
  frameLoads: Record<string, DistributedLoad[]>;
}

export type LoadCombinationType = "linear_add" | "envelope";

export interface LoadCombinationData {
  id: string;
  name: string;
  /** pymas real no exporta `type`: se asume linear_add. */
  type: LoadCombinationType;
  factors: Record<string, number>;
}

export interface Vector6D {
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

export interface Displacement6D {
  ux: number;
  uy: number;
  uz: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface FrameStationForces {
  /** Coordenadas normalizadas 0..1 a lo largo de la barra. */
  stations: number[];
  fx: number[];
  fy: number[];
  fz: number[];
  mx: number[];
  my: number[];
  mz: number[];
  hasExplicitStations: boolean;
}

export interface FrameStationDisplacements {
  stations: number[];
  ux: number[];
  uy: number[];
  uz: number[];
  rx: number[];
  ry: number[];
  rz: number[];
  hasExplicitStations: boolean;
}

export interface FrameResultData {
  endActions: {
    i: Vector6D;
    j: Vector6D;
  };
  internalForces: FrameStationForces;
  internalDisplacements: FrameStationDisplacements;
}

export interface PatternResultData {
  nodalDisplacements: Record<string, Displacement6D>;
  reactions: Record<string, Vector6D>;
  frameResults: Record<string, FrameResultData>;
}

export interface ModelStats {
  nodes: number;
  frames: number;
  supports: number;
  materials: number;
  sections: number;
  releases: number;
  patterns: number;
  combinations: number;
  results: number;
}

export interface PymasModel {
  meta: ModelMeta;
  nodes: Record<string, NodeData>;
  nodeOrder: string[];
  supports: Record<string, SupportData>;
  materials: Record<string, MaterialData>;
  sections: Record<string, SectionData>;
  releases: Record<string, ReleaseData>;
  frames: Record<string, FrameData>;
  frameOrder: string[];
  loadPatterns: Record<string, LoadPatternData>;
  loadPatternOrder: string[];
  loadCombinations: Record<string, LoadCombinationData>;
  loadCombinationOrder: string[];
  results: Record<string, PatternResultData>;
  resultOrder: string[];
  warnings: string[];
  stats: ModelStats;
}

export interface EnvelopeResult {
  min: PatternResultData;
  max: PatternResultData;
}

export interface SampleEntry {
  file: string;
  label: string;
  name: string;
  type: string;
  nodes: number;
  frames: number;
  supports: number;
  patterns: number;
  combinations: number;
  sizeBytes: number;
}

export interface SampleManifest {
  generatedAt: string;
  source: string;
  samples: SampleEntry[];
}
