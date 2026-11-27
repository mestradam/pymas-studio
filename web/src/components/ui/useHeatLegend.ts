import { useMemo } from "react";
import { formatNumber } from "../../engine/geometry";
import {
  HEATMAP_LABELS,
  isDeformationScalar,
  isForceHeatScalar,
  isMomentScalar,
  isRotationScalar,
  type HeatmapMode,
} from "../../engine/heatmap";
import { resultHeatRange } from "../../engine/resultHeatmap";
import type { UpAxis } from "../../engine/upAxis";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import {
  useModelStore,
  type DeformedRenderMode,
  type RenderMode,
} from "../../store/useModelStore";

/** Datos de la escala del mapa de colores tal como se ve en la escena. */
export interface HeatLegendData {
  /** Magnitud activa, por ejemplo "Mz" o "|U|". */
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Formatea un valor de la escala con su unidad. */
  format: (value: number) => string;
  /** Formatea sólo el número (la unidad va en el encabezado de la escala). */
  formatValue: (value: number) => string;
}

export interface HeatLegendInput {
  model: PymasModel | null;
  result: PatternResultData | null;
  heatmapMode: HeatmapMode;
  upAxis: UpAxis;
  renderMode: RenderMode;
  showDeformed: boolean;
  deformedRenderMode: DeformedRenderMode;
}

/**
 * `true` si algún objeto de la escena está teñido con el mapa activo. Replica
 * las reglas de `FrameMesh` (sólo el sólido extruido se colorea) y de
 * `DeformedStructure` (la línea sólo con escalares de deformada; el sólido
 * deformado con cualquiera).
 */
export function heatmapVisible(input: HeatLegendInput): boolean {
  const { heatmapMode } = input;
  if (heatmapMode === "none") return false;
  const deformedHidesSolid =
    input.showDeformed && input.deformedRenderMode === "extruded";
  if (input.renderMode === "extruded" && !deformedHidesSolid) return true;
  if (!input.showDeformed) return false;
  return input.deformedRenderMode === "extruded" || isDeformationScalar(heatmapMode);
}

/** Escala del mapa activo, o `null` si no hay colores que explicar. */
export function heatLegendData(input: HeatLegendInput): HeatLegendData | null {
  const { model, result, heatmapMode } = input;
  if (!model || !result || heatmapMode === "none") return null;
  if (!heatmapVisible(input)) return null;

  let range: { min: number; max: number };
  try {
    range = resultHeatRange(model, result, heatmapMode, input.upAxis);
  } catch {
    return null;
  }
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;

  const { force, length } = model.meta.units;
  const unit = isForceHeatScalar(heatmapMode)
    ? isMomentScalar(heatmapMode)
      ? `${force}·${length}`
      : force
    : isRotationScalar(heatmapMode)
      ? "rad"
      : heatmapMode === "drift"
        ? "%"
        : length;
  const formatValue = (value: number) =>
    heatmapMode === "drift" ? (value * 100).toFixed(3) : formatNumber(value);
  const format = (value: number) => `${formatValue(value)} ${unit}`.trim();

  return {
    label: HEATMAP_LABELS[heatmapMode],
    unit,
    min: range.min,
    max: range.max,
    format,
    formatValue,
  };
}

/** Lee del store los datos que necesita `heatLegendData`. */
export function heatLegendInputFromStore(): HeatLegendInput {
  const state = useModelStore.getState();
  return {
    model: state.model,
    result: state.computedResult,
    heatmapMode: state.heatmapMode,
    upAxis: state.upAxis,
    renderMode: state.renderMode,
    showDeformed: state.showDeformed,
    deformedRenderMode: state.deformedRenderMode,
  };
}

/** Escala del mapa de colores activo, memorizada para la interfaz. */
export function useHeatLegend(): HeatLegendData | null {
  const model = useModelStore((state) => state.model);
  const result = useModelStore((state) => state.computedResult);
  const heatmapMode = useModelStore((state) => state.heatmapMode);
  const upAxis = useModelStore((state) => state.upAxis);
  const renderMode = useModelStore((state) => state.renderMode);
  const showDeformed = useModelStore((state) => state.showDeformed);
  const deformedRenderMode = useModelStore((state) => state.deformedRenderMode);

  return useMemo(
    () =>
      heatLegendData({
        model,
        result,
        heatmapMode,
        upAxis,
        renderMode,
        showDeformed,
        deformedRenderMode,
      }),
    [model, result, heatmapMode, upAxis, renderMode, showDeformed, deformedRenderMode],
  );
}
