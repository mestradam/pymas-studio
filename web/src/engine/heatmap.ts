/**
 * Catálogo de magnitudes coloreables sobre la estructura.
 *
 * Se distinguen dos familias:
 *  - `DeformationScalar`: desplazamientos y giros globales de la deformada y
 *    deriva.
 *  - `ForceHeatScalar`: las seis acciones internas locales de pymas
 *    (`fx`…`mz`), que también alimentan los diagramas clásicos.
 *
 * El mapa de color es sólo otra forma de leer el mismo resultado: no reemplaza
 * los diagramas de acciones internas, que siguen dibujándose como ordenadas 3D.
 */
export type DeformationScalar =
  | "magnitude"
  | "ux"
  | "uy"
  | "uz"
  | "rx"
  | "ry"
  | "rz"
  | "drift";
export type ForceHeatScalar = "fx" | "fy" | "fz" | "mx" | "my" | "mz";
export type HeatmapScalar = DeformationScalar | ForceHeatScalar;
export type HeatmapMode = "none" | HeatmapScalar;

export const DEFORMATION_HEAT_SCALARS = [
  "magnitude",
  "ux",
  "uy",
  "uz",
  "rx",
  "ry",
  "rz",
  "drift",
] as const satisfies readonly DeformationScalar[];

export const FORCE_HEAT_SCALARS = [
  "fx",
  "fy",
  "fz",
  "mx",
  "my",
  "mz",
] as const satisfies readonly ForceHeatScalar[];

/** Etiquetas cortas para la barra lateral y la leyenda. */
export const HEATMAP_LABELS: Record<HeatmapMode, string> = {
  none: "Plano",
  magnitude: "|U|",
  ux: "ux",
  uy: "uy",
  uz: "uz",
  rx: "rx",
  ry: "ry",
  rz: "rz",
  drift: "Deriva",
  fx: "N",
  fy: "Vy",
  fz: "Vz",
  mx: "T",
  my: "My",
  mz: "Mz",
};

export function isDeformationScalar(
  mode: HeatmapMode,
): mode is DeformationScalar {
  return (DEFORMATION_HEAT_SCALARS as readonly string[]).includes(mode);
}

export function isForceHeatScalar(mode: HeatmapMode): mode is ForceHeatScalar {
  return (FORCE_HEAT_SCALARS as readonly string[]).includes(mode);
}

/** `true` para los giros globales (`rx`, `ry`, `rz`), expresados en rad. */
export function isRotationScalar(mode: HeatmapMode): boolean {
  return mode === "rx" || mode === "ry" || mode === "rz";
}

/** `true` para los momentos (`mx`, `my`, `mz`), cuya unidad es fuerza·longitud. */
export function isMomentScalar(mode: HeatmapMode): boolean {
  return mode === "mx" || mode === "my" || mode === "mz";
}

interface ColorStop {
  at: number;
  color: [number, number, number];
}

const STOPS: ColorStop[] = [
  { at: 0, color: [0.16, 0.78, 0.95] },
  { at: 0.32, color: [0.16, 0.9, 0.62] },
  { at: 0.58, color: [0.72, 0.93, 0.24] },
  { at: 0.8, color: [0.99, 0.77, 0.16] },
  { at: 1, color: [0.97, 0.3, 0.3] },
];

export const HEATMAP_GRADIENT =
  "linear-gradient(90deg, #29c7f2 0%, #29e69e 32%, #b8ed3d 58%, #fcc429 80%, #f74d4d 100%)";

/** Color RGB (0..1) para un valor dentro del rango [min, max]. */
export function heatmapColor(
  value: number,
  min: number,
  max: number,
): [number, number, number] {
  if (!Number.isFinite(value)) return [0.5, 0.5, 0.5];
  const span = max - min;
  const t = span > 1e-15 ? Math.min(1, Math.max(0, (value - min) / span)) : 0.5;

  for (let index = 0; index < STOPS.length - 1; index += 1) {
    const left = STOPS[index];
    const right = STOPS[index + 1];
    if (!left || !right) continue;
    if (t >= left.at && t <= right.at) {
      const spanStop = Math.max(right.at - left.at, 1e-15);
      const local = (t - left.at) / spanStop;
      return [
        left.color[0] + (right.color[0] - left.color[0]) * local,
        left.color[1] + (right.color[1] - left.color[1]) * local,
        left.color[2] + (right.color[2] - left.color[2]) * local,
      ];
    }
  }

  return [...(STOPS[STOPS.length - 1]?.color ?? [0.94, 0.27, 0.27])];
}

export function heatmapRange(values: readonly number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}
