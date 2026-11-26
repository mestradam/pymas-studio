import { useMemo } from "react";
import { formatNumber } from "../../engine/geometry";
import {
  buildFrameChartSeries,
  interpolateSeriesAt,
  type ChartFamily,
  type FrameChartSeries,
} from "../../engine/inspection";
import { useModelStore } from "../../store/useModelStore";

function Row({
  title,
  entries,
  station,
  unitOf,
}: {
  title: string;
  entries: FrameChartSeries[];
  station: number;
  unitOf: Record<ChartFamily, string>;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[9px] uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="grid grid-cols-6 gap-x-4 font-mono text-[11px] leading-tight">
        {entries.map((entry) => (
          <div key={entry.key} className="flex flex-col">
            <span className="text-slate-400">{entry.label.split(" · ")[0]}</span>
            <span className="whitespace-nowrap tabular-nums text-slate-100">
              {formatNumber(interpolateSeriesAt(entry.stations, entry.values, station))}
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

/**
 * Lectura de valores en la estación bajo el cursor de las gráficas del
 * inspector: las seis acciones internas (ejes locales) y los seis movimientos
 * (ejes globales), con las mismas series que dibuja el inspector. Se muestra
 * fija abajo, a la derecha del panel izquierdo, para no tapar la barra; el
 * marcador 3D (`ChartCursorMarker`) la recorre.
 */
export default function ChartCursorReadout() {
  const model = useModelStore((state) => state.model);
  const computedResult = useModelStore((state) => state.computedResult);
  const selectedFrameId = useModelStore((state) => state.selectedFrameId);
  const chartStation = useModelStore((state) => state.chartStation);

  const frame = selectedFrameId ? model?.frames[selectedFrameId] : undefined;

  const series = useMemo(() => {
    if (!model || !computedResult || !selectedFrameId) return null;
    return buildFrameChartSeries(model, computedResult, selectedFrameId);
  }, [model, computedResult, selectedFrameId]);

  if (!model || !frame || !series || chartStation === null) return null;

  const { force, length: lengthUnit } = model.meta.units;
  const unitOf: Record<ChartFamily, string> = {
    force,
    moment: `${force}·${lengthUnit}`,
    displacement: lengthUnit,
    rotation: "rad",
  };
  const actions = series.filter(
    (entry) => entry.family === "force" || entry.family === "moment",
  );
  const movements = series.filter(
    (entry) => entry.family === "displacement" || entry.family === "rotation",
  );
  const length = Math.max(frame.length, 1e-9);

  return (
    <div className="pointer-events-none absolute bottom-3 left-[calc(min(372px,94vw)+12px)] z-40 max-w-[calc(100vw-min(372px,94vw)-24px)] select-none space-y-1.5 rounded-lg border border-orange-300/50 bg-slate-950 px-3 py-2 shadow-xl">
      <div className="flex items-baseline gap-3 font-mono text-[11px]">
        <span className="text-orange-300">{frame.name || frame.id}</span>
        <span className="text-slate-200">
          x = {formatNumber(chartStation * length)} {lengthUnit}
        </span>
        <span className="text-slate-500">ξ {chartStation.toFixed(2)}</span>
      </div>
      <Row
        title="Acciones internas · ejes locales"
        entries={actions}
        station={chartStation}
        unitOf={unitOf}
      />
      {movements.length > 0 && (
        <Row
          title="Movimientos · ejes globales"
          entries={movements}
          station={chartStation}
          unitOf={unitOf}
        />
      )}
    </div>
  );
}
