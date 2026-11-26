import { useMemo } from "react";
import { formatNumber } from "../../engine/geometry";
import {
  buildFrameChartSeries,
  interpolateSeriesAt,
  type ChartFamily,
} from "../../engine/inspection";
import { useModelStore } from "../../store/useModelStore";

/**
 * Lectura de valores en la estación bajo el cursor de las gráficas del
 * inspector. Se muestra fija abajo, a la derecha del panel izquierdo, para no
 * tapar la barra; el marcador 3D (`ChartCursorMarker`) sigue recorriéndola.
 */
export default function ChartCursorReadout() {
  const model = useModelStore((state) => state.model);
  const computedResult = useModelStore((state) => state.computedResult);
  const selectedFrameId = useModelStore((state) => state.selectedFrameId);
  const chartStation = useModelStore((state) => state.chartStation);

  const frame = selectedFrameId ? model?.frames[selectedFrameId] : undefined;
  const hasResult = Boolean(
    selectedFrameId && computedResult?.frameResults[selectedFrameId],
  );

  const series = useMemo(() => {
    if (!computedResult || !selectedFrameId || !hasResult) return null;
    return buildFrameChartSeries(computedResult, selectedFrameId);
  }, [computedResult, selectedFrameId, hasResult]);

  if (!model || !frame || !series || chartStation === null) return null;

  const { force, length: lengthUnit } = model.meta.units;
  const unitOf: Record<ChartFamily, string> = {
    force,
    moment: `${force}·${lengthUnit}`,
    displacement: lengthUnit,
  };
  const length = Math.max(frame.length, 1e-9);

  return (
    <div className="pointer-events-none absolute bottom-3 left-[calc(min(372px,94vw)+12px)] z-40 select-none rounded-lg border border-orange-300/50 bg-slate-950 px-3 py-2 shadow-xl">
      <div className="mb-1.5 flex items-baseline gap-3 font-mono text-[11px]">
        <span className="text-orange-300">{frame.name || frame.id}</span>
        <span className="text-slate-200">
          x = {formatNumber(chartStation * length)} {lengthUnit}
        </span>
        <span className="text-slate-500">ξ {chartStation.toFixed(2)}</span>
      </div>
      <div className="grid grid-cols-4 gap-x-4 gap-y-1 font-mono text-[11px] leading-tight">
        {series.map((entry) => (
          <div key={entry.key} className="flex items-baseline justify-between gap-2">
            <span className="text-slate-400">{entry.label.split(" · ")[0]}</span>
            <span className="tabular-nums text-slate-100">
              {formatNumber(
                interpolateSeriesAt(entry.stations, entry.values, chartStation),
              )}
              <span className="ml-1 text-[9px] text-slate-500">
                {unitOf[entry.family]}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
