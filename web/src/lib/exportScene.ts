import { useModelStore } from "../store/useModelStore";
import {
  captureCanvas,
  type CaptureBackground,
} from "../components/viewport/captureRegistry";
import {
  comparisonCsv,
  frameForcesCsv,
  nodalDisplacementsCsv,
  reactionsCsv,
} from "../engine/exporters";
import { heatmapColor } from "../engine/heatmap";
import {
  heatLegendData,
  heatLegendInputFromStore,
  type HeatLegendData,
} from "../components/ui/useHeatLegend";

function sanitizeFileName(value: string): string {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "pymas";
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadCsvFile(fileName: string, content: string): void {
  // BOM para que Excel detecte UTF-8 (nombres con tildes, Δ, etc.).
  const blob = new Blob(["\ufeff", content], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, fileName);
}

function activeCaseLabel(): string {
  const state = useModelStore.getState();
  const model = state.model;
  if (!model) return "Sin caso";
  if (state.resultMode === "pattern") {
    const id = state.activePatternId;
    return (id ? model.loadPatterns[id]?.name : null) ?? id ?? "Patrón";
  }
  if (state.resultMode === "combination") {
    const id = state.activeCombinationId;
    return (
      (id ? model.loadCombinations[id]?.name : null) ?? id ?? "Combinación"
    );
  }
  return state.resultMode === "env_max" ? "Envolvente máxima" : "Envolvente mínima";
}

function fileNameBase(): string {
  const state = useModelStore.getState();
  const model = state.model;
  const label = model?.meta.name ?? state.sourceLabel ?? "modelo";
  return `${sanitizeFileName(label)}-${sanitizeFileName(activeCaseLabel())}`;
}

export function downloadDisplacementsCsv(): boolean {
  const state = useModelStore.getState();
  if (!state.model || !state.computedResult) return false;
  downloadCsvFile(
    `pymas-desplazamientos-${fileNameBase()}.csv`,
    nodalDisplacementsCsv(
      state.model,
      state.computedResult,
      state.sourceLabel ?? state.model.meta.name,
    ),
  );
  return true;
}

export function downloadReactionsCsv(): boolean {
  const state = useModelStore.getState();
  if (!state.model || !state.computedResult) return false;
  downloadCsvFile(
    `pymas-reacciones-${fileNameBase()}.csv`,
    reactionsCsv(
      state.model,
      state.computedResult,
      state.sourceLabel ?? state.model.meta.name,
    ),
  );
  return true;
}

export function downloadFrameForcesCsv(): boolean {
  const state = useModelStore.getState();
  if (!state.model || !state.computedResult) return false;
  downloadCsvFile(
    `pymas-fuerzas-barras-${fileNameBase()}.csv`,
    frameForcesCsv(
      state.model,
      state.computedResult,
      state.sourceLabel ?? state.model.meta.name,
    ),
  );
  return true;
}

export function downloadComparisonCsv(): boolean {
  const state = useModelStore.getState();
  if (!state.model || !state.compareModel || !state.compareComparison) {
    return false;
  }
  downloadCsvFile(
    `pymas-comparacion-${sanitizeFileName(state.model.meta.name)}-vs-${sanitizeFileName(
      state.compareModel.meta.name,
    )}.csv`,
    comparisonCsv(state.compareComparison, {
      modelALabel: state.sourceLabel ?? state.model.meta.name,
      modelBLabel: state.compareSourceLabel ?? state.compareModel.meta.name,
      caseLabel: activeCaseLabel(),
    }),
  );
  return true;
}

const FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Escala vertical del mapa de colores dentro de la imagen, pegada al borde
 * derecho y centrada en altura, igual que `HeatLegendOverlay` en el visor.
 * `pixel` es la relación píxeles de salida / píxeles CSS.
 */
function drawHeatLegend(
  context: CanvasRenderingContext2D,
  legend: HeatLegendData,
  canvasWidth: number,
  canvasHeight: number,
  pixel: number,
  light: boolean,
): void {
  const barWidth = 12 * pixel;
  const barHeight = Math.min(176 * pixel, canvasHeight * 0.6);
  const padding = 8 * pixel;
  const gap = 6 * pixel;
  const valueFont = `500 ${10 * pixel}px ${FONT_FAMILY}`;
  const titleFont = `600 ${11 * pixel}px ${FONT_FAMILY}`;
  const unitFont = `400 ${9 * pixel}px ${FONT_FAMILY}`;
  const middle = (legend.min + legend.max) / 2;
  const values = [legend.max, middle, legend.min].map(legend.formatValue);

  context.save();
  context.font = valueFont;
  const valueWidth = Math.max(...values.map((value) => context.measureText(value).width));
  context.font = titleFont;
  const titleWidth = context.measureText(legend.label).width;
  context.font = unitFont;
  const unitWidth = context.measureText(legend.unit).width;
  const titleHeight = (legend.unit ? 24 : 14) * pixel;

  const width = Math.max(barWidth + gap + valueWidth, titleWidth, unitWidth) + padding * 2;
  const height = padding * 2 + titleHeight + gap + barHeight;
  const x = canvasWidth - 12 * pixel - width;
  const y = (canvasHeight - height) / 2;

  // Tarjeta opaca, como en el visor.
  context.fillStyle = light ? "#ffffff" : "#020617";
  context.strokeStyle = light ? "rgba(15, 23, 42, 0.18)" : "rgba(255, 255, 255, 0.12)";
  context.lineWidth = pixel;
  context.beginPath();
  context.roundRect(x, y, width, height, 8 * pixel);
  context.fill();
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = light ? "#0f172a" : "#f1f5f9";
  context.font = titleFont;
  context.fillText(legend.label, x + width / 2, y + padding);
  if (legend.unit) {
    context.fillStyle = light ? "#64748b" : "#64748b";
    context.font = unitFont;
    context.fillText(legend.unit, x + width / 2, y + padding + 13 * pixel);
  }

  // Barra: mínimo abajo, máximo arriba, con los mismos colores de la escena.
  const barX = x + padding;
  const barY = y + padding + titleHeight + gap;
  const gradient = context.createLinearGradient(0, barY + barHeight, 0, barY);
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20;
    const [r, g, b] = heatmapColor(t, 0, 1);
    gradient.addColorStop(
      t,
      `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`,
    );
  }
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(barX, barY, barWidth, barHeight, barWidth / 2);
  context.fill();

  context.textAlign = "left";
  context.font = valueFont;
  const valueX = barX + barWidth + gap;
  context.fillStyle = light ? "#334155" : "#cbd5e1";
  context.textBaseline = "top";
  context.fillText(values[0]!, valueX, barY);
  context.fillStyle = light ? "#64748b" : "#64748b";
  context.textBaseline = "middle";
  context.fillText(values[1]!, valueX, barY + barHeight / 2);
  context.fillStyle = light ? "#334155" : "#cbd5e1";
  context.textBaseline = "bottom";
  context.fillText(values[2]!, valueX, barY + barHeight);
  context.restore();
}

/** Leyenda del mapa de demanda A→B, abajo al centro, como en el visor. */
function drawCompareLegend(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  pixel: number,
  light: boolean,
): void {
  const barWidth = 96 * pixel;
  const barHeight = 6 * pixel;
  const padding = 8 * pixel;
  const font = `500 ${9 * pixel}px ${FONT_FAMILY}`;
  const title = "DEMANDA A→B";
  const ticks = "−50 % · 0 · +50 %";

  context.save();
  context.font = font;
  const titleWidth = context.measureText(title).width;
  const ticksWidth = context.measureText(ticks).width;
  const width = padding * 4 + titleWidth + barWidth + ticksWidth;
  const height = 24 * pixel;
  const x = (canvasWidth - width) / 2;
  const y = canvasHeight - 12 * pixel - height;

  context.fillStyle = light ? "#ffffff" : "#020617";
  context.strokeStyle = light ? "rgba(15, 23, 42, 0.18)" : "rgba(255, 255, 255, 0.12)";
  context.lineWidth = pixel;
  context.beginPath();
  context.roundRect(x, y, width, height, 8 * pixel);
  context.fill();
  context.stroke();

  context.textBaseline = "middle";
  context.fillStyle = light ? "#475569" : "#94a3b8";
  context.fillText(title, x + padding, y + height / 2);
  const barX = x + padding * 2 + titleWidth;
  const gradient = context.createLinearGradient(barX, 0, barX + barWidth, 0);
  gradient.addColorStop(0, light ? "#15803d" : "#22c55e");
  gradient.addColorStop(0.5, light ? "#475569" : "#64748b");
  gradient.addColorStop(1, light ? "#b91c1c" : "#ef4444");
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(barX, y + (height - barHeight) / 2, barWidth, barHeight, barHeight / 2);
  context.fill();
  context.fillStyle = light ? "#475569" : "#94a3b8";
  context.fillText(ticks, barX + barWidth + padding, y + height / 2);
  context.restore();
}

export interface ScenePngOptions {
  whiteBackground: boolean;
  /** Multiplicador del pixel ratio del WebGL (2 = alta resolución). */
  scale?: number;
}

/**
 * Descarga un PNG con exactamente el recuadro del visor: la escena 3D, sus
 * etiquetas y, si hay mapa de colores, su escala. Sin títulos ni márgenes.
 * En comparación lado a lado se unen los dos paneles con una línea divisoria.
 */
export async function exportScenePng({
  whiteBackground,
  scale = 2,
}: ScenePngOptions): Promise<boolean> {
  const state = useModelStore.getState();
  const model = state.model;
  if (!model) return false;

  const background: CaptureBackground = whiteBackground ? "white" : "dark";
  const comparing = Boolean(state.compareEnabled && state.compareModel);
  const split = Boolean(comparing && state.compareView === "split");
  const paneA = captureCanvas("a", scale, background);
  if (!paneA) return false;
  const paneB = split ? captureCanvas("b", scale, background) : null;

  const light = whiteBackground;
  const divider = paneB ? Math.max(1, Math.round(scale)) : 0;
  const width = paneA.width + (paneB ? divider + paneB.width : 0);
  const height = Math.max(paneA.height, paneB?.height ?? 0);
  // Relación píxeles de salida / píxeles CSS del visor (≈ scale).
  const pixel = Math.max(scale, 1);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.fillStyle = light ? "#ffffff" : "#060a13";
  context.fillRect(0, 0, width, height);
  context.drawImage(paneA, 0, 0);
  if (paneB) {
    context.fillStyle = light ? "rgba(15, 23, 42, 0.18)" : "rgba(255, 255, 255, 0.14)";
    context.fillRect(paneA.width, 0, divider, height);
    context.drawImage(paneB, paneA.width + divider, 0);
  }

  const legend = heatLegendData(heatLegendInputFromStore());
  if (legend) drawHeatLegend(context, legend, width, height, pixel, light);
  if (comparing && state.compareHeatmap) {
    drawCompareLegend(context, width, height, pixel, light);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) return false;
  downloadBlob(
    blob,
    `pymas-vista-${sanitizeFileName(model.meta.name)}-${timestamp()}.png`,
  );
  return true;
}
