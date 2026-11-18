/** Modos de coloreado de la deformada. */
export type HeatmapScalar = "magnitude" | "ux" | "uy" | "uz" | "drift";
export type HeatmapMode = "none" | HeatmapScalar;

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
