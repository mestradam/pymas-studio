import { HEATMAP_GRADIENT } from "../../engine/heatmap";
import { useHeatLegend } from "./useHeatLegend";

/** Gradiente vertical: mínimo abajo, máximo arriba. */
export const HEATMAP_GRADIENT_VERTICAL = HEATMAP_GRADIENT.replace("90deg", "0deg");

/**
 * Escala del mapa de colores fija sobre el visor, pegada al borde derecho,
 * para que siga visible aunque se desplace el panel de control. La misma
 * escala se dibuja dentro del PNG exportado (`lib/exportScene.ts`).
 */
export default function HeatLegendOverlay() {
  const legend = useHeatLegend();
  if (!legend) return null;

  const middle = (legend.min + legend.max) / 2;

  return (
    <div
      data-heat-legend
      className="pointer-events-none absolute right-3 top-1/2 z-20 flex -translate-y-1/2 select-none flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950 px-2 py-2 shadow-xl"
    >
      <div className="text-center font-mono text-[11px] font-semibold leading-tight text-slate-100">
        {legend.label}
        {legend.unit && (
          <div className="text-[9px] font-normal text-slate-500">{legend.unit}</div>
        )}
      </div>
      <div className="flex items-stretch gap-1.5">
        <div
          className="h-44 w-3 rounded-full border border-white/10"
          style={{ background: HEATMAP_GRADIENT_VERTICAL }}
        />
        <div className="flex flex-col justify-between font-mono text-[10px] tabular-nums text-slate-300">
          <span>{legend.formatValue(legend.max)}</span>
          <span className="text-slate-500">{legend.formatValue(middle)}</span>
          <span>{legend.formatValue(legend.min)}</span>
        </div>
      </div>
    </div>
  );
}
