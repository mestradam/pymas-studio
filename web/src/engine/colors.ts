import type { FrameData, PymasModel } from "../types/pymas";

export type ColorMode = "material" | "section" | "uniform";

export const COLOR_PALETTE = [
  "#38bdf8",
  "#f59e0b",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
  "#facc15",
  "#4ade80",
  "#f97316",
  "#60a5fa",
  "#c084fc",
];

const UNIFORM_COLOR = "#94a3b8";
const FALLBACK_COLOR = "#64748b";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function paletteFor(key: string): string {
  const index = hashString(key) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index] ?? FALLBACK_COLOR;
}

export function colorForId(id: string, mode: ColorMode): string {
  if (mode === "uniform") return UNIFORM_COLOR;
  if (!id) return FALLBACK_COLOR;
  if (mode === "material") {
    // Convención de los modelos de reparación: MAT_E = existente,
    // MAT_N = nuevo/reforzamiento. Se mantienen colores inequívocos.
    if (/(^|_)E$/i.test(id) || /existente|existing/i.test(id)) return "#38bdf8";
    if (/(^|_)N$/i.test(id) || /nuevo|new|reforz/i.test(id)) return "#f59e0b";
  }
  return paletteFor(id);
}

export function frameColor(frame: FrameData, _model: PymasModel, mode: ColorMode): string {
  if (mode === "material") return colorForId(frame.materialId, mode);
  if (mode === "section") return colorForId(frame.sectionId, mode);
  return colorForId("", "uniform");
}

export interface LegendEntry {
  id: string;
  label: string;
  color: string;
  count: number;
}

export function buildLegend(model: PymasModel, mode: ColorMode): LegendEntry[] {
  if (mode === "uniform") {
    return [
      {
        id: "uniform",
        label: "Estructura",
        color: colorForId("", "uniform"),
        count: model.stats.frames,
      },
    ];
  }

  const counter = new Map<string, number>();
  for (const frame of Object.values(model.frames)) {
    const id = mode === "material" ? frame.materialId : frame.sectionId;
    counter.set(id, (counter.get(id) ?? 0) + 1);
  }

  const source = mode === "material" ? model.materials : model.sections;
  const entries: LegendEntry[] = [];
  for (const [id, entity] of Object.entries(source)) {
    entries.push({
      id,
      label: entity.name,
      color: colorForId(id, mode),
      count: counter.get(id) ?? 0,
    });
  }
  for (const [id, count] of counter) {
    if (source[id]) continue;
    entries.push({
      id,
      label: id ? `${id} (sin definir)` : "Sin asignar",
      color: colorForId(id, mode),
      count,
    });
  }
  return entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
