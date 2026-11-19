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

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawPaneLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  light: boolean,
): void {
  context.save();
  context.font =
    "600 18px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const width = context.measureText(text).width + 24;
  context.fillStyle = light ? "rgba(15, 23, 42, 0.78)" : "rgba(15, 23, 42, 0.82)";
  context.beginPath();
  context.roundRect(x + 16, y + 16, width, 34, 8);
  context.fill();
  context.fillStyle = "#f8fafc";
  context.fillText(text, x + 28, y + 39);
  context.restore();
}

function drawHeatLegend(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  light: boolean,
): void {
  const width = 220;
  const height = 12;
  const gradient = context.createLinearGradient(x, 0, x + width, 0);
  // Sobre blanco la leyenda usa tonos más profundos para conservar contraste.
  gradient.addColorStop(0, light ? "#15803d" : "#22c55e");
  gradient.addColorStop(0.5, light ? "#475569" : "#64748b");
  gradient.addColorStop(1, light ? "#b91c1c" : "#ef4444");
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(x, y, width, height, 4);
  context.fill();
  context.font =
    "500 14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  context.fillStyle = light ? "#334155" : "#94a3b8";
  context.fillText("−50 %", x, y + 30);
  context.fillText("0", x + width / 2 - 4, y + 30);
  context.fillText("+50 %", x + width - 34, y + 30);
  context.fillStyle = light ? "#475569" : "#cbd5e1";
  context.fillText("Demanda de barras: verde reduce · rojo aumenta", x + width + 18, y + 12);
}

export interface ScenePngOptions {
  whiteBackground: boolean;
  /** Multiplicador del pixel ratio del WebGL (2 = alta resolución). */
  scale?: number;
}

/** Compone y descarga un PNG del lienzo 3D actual, con leyenda de caso/escala. */
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
  const paneWidth = 1600;
  const gap = 16;
  const padding = 48;
  const headerHeight = 112;
  const footerHeight = 96;
  const paneHeight = Math.round(
    paneWidth * (paneA.height / Math.max(paneA.width, 1)),
  );
  const paneCount = paneB ? 2 : 1;
  const width = padding * 2 + paneWidth * paneCount + gap * (paneCount - 1);
  const height = padding * 2 + headerHeight + paneHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.fillStyle = light ? "#ffffff" : "#060a13";
  context.fillRect(0, 0, width, height);

  const title = comparing
    ? "PyMAS Studio 3D · Comparación de modelos A/B"
    : "PyMAS Studio 3D · Modelo estructural";
  context.fillStyle = light ? "#0f172a" : "#f8fafc";
  context.font =
    "700 32px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  context.fillText(title, padding, padding + 30);

  context.font =
    "500 17px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  context.fillStyle = light ? "#475569" : "#94a3b8";
  const models = comparing
    ? `A · ${state.sourceLabel ?? model.meta.name}    ↔    B · ${
        state.compareSourceLabel ?? state.compareModel?.meta.name ?? "Modelo B"
      }`
    : state.sourceLabel ?? model.meta.name;
  context.fillText(models.slice(0, 130), padding, padding + 60);

  context.textAlign = "right";
  context.fillStyle = light ? "#64748b" : "#64748b";
  context.font =
    "500 15px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  context.fillText(
    new Date().toLocaleString("es-ES"),
    width - padding,
    padding + 28,
  );
  context.textAlign = "left";

  const paneTop = padding + headerHeight;
  const paneAX = padding;
  drawCover(context, paneA, paneAX, paneTop, paneWidth, paneHeight);
  context.strokeStyle = light ? "rgba(15, 23, 42, 0.18)" : "rgba(255, 255, 255, 0.14)";
  context.lineWidth = 2;
  context.strokeRect(paneAX, paneTop, paneWidth, paneHeight);
  if (paneB) {
    const paneBX = padding + paneWidth + gap;
    drawCover(context, paneB, paneBX, paneTop, paneWidth, paneHeight);
    context.strokeRect(paneBX, paneTop, paneWidth, paneHeight);
    drawPaneLabel(context, "A · Base", paneAX, paneTop, light);
    drawPaneLabel(context, "B · Modificado", paneBX, paneTop, light);
  } else if (comparing) {
    drawPaneLabel(context, "A + B · superpuestos", paneAX, paneTop, light);
  }

  const footerY = paneTop + paneHeight + 34;
  context.font =
    "500 15px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  context.fillStyle = light ? "#334155" : "#cbd5e1";
  const units = `${model.meta.units.force} · ${model.meta.units.length}`;
  context.fillText(
    `Caso: ${activeCaseLabel()}    ·    Unidades: ${units}    ·    Escala de deformada: ×${state.deformationScale}${
      state.showDeformed ? "" : " (deformada oculta)"
    }`,
    padding,
    footerY,
  );

  if (comparing && state.compareHeatmap) {
    drawHeatLegend(context, padding, footerY + 18, light);
  } else {
    context.fillStyle = light ? "#64748b" : "#64748b";
    context.fillText(
      "Vista generada desde el visor; escala y caso activos al momento de exportar.",
      padding,
      footerY + 24,
    );
  }

  context.textAlign = "right";
  context.fillStyle = light ? "#94a3b8" : "#475569";
  context.font =
    "500 13px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  context.fillText("PyMAS Studio 3D", width - padding, footerY + 30);
  context.textAlign = "left";

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
