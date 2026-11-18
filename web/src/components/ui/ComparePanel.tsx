import { useMemo, useRef } from "react";
import {
  Columns2,
  Download,
  FileJson,
  GitCompareArrows,
  Layers,
  Palette,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { formatNumber } from "../../engine/geometry";
import {
  demandColor,
  frameDemandPercent,
  type ComparisonValue,
  type FrameDemandDiff,
  type ReactionDiff,
} from "../../engine/comparison";
import { downloadComparisonCsv } from "../../lib/exportScene";
import { cn } from "../../lib/utils";

function percentText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} %`;
}

function trendClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-slate-400";
  return value > 0
    ? "text-rose-300"
    : value < 0
      ? "text-emerald-300"
      : "text-slate-400";
}

function deltaText(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)} ${unit}`;
}

function MetricCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: ComparisonValue;
  unit: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1 font-mono text-[12px] tabular-nums text-slate-100">
        <span>{formatNumber(value.a)}</span>
        <span className="text-slate-600">→</span>
        <span>{formatNumber(value.b)}</span>
        <span className="text-[9px] font-sans text-slate-500">{unit}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px]">
        <span className="font-mono tabular-nums text-slate-500">
          {deltaText(value.delta, unit)}
        </span>
        <span className={cn("font-mono font-semibold tabular-nums", trendClass(value.percent))}>
          {percentText(value.percent)}
        </span>
      </div>
      {hint && <div className="mt-0.5 truncate text-[9px] text-slate-600">{hint}</div>}
    </div>
  );
}

function FrameChangeRow({
  frame,
  onSelect,
}: {
  frame: FrameDemandDiff;
  onSelect: () => void;
}) {
  const demand = frameDemandPercent(frame);
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-white/[0.05]"
      onClick={onSelect}
      title={`${frame.label} · ${frame.sectionName || "sección"}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: demandColor(demand) }}
      />
      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">
        {frame.label}
      </span>
      <span className="font-mono text-[9px] tabular-nums text-slate-500">
        {formatNumber(frame.maxForce.a)}→{formatNumber(frame.maxForce.b)}
      </span>
      <span
        className={cn(
          "w-[52px] shrink-0 text-right font-mono text-[10px] font-semibold tabular-nums",
          trendClass(demand),
        )}
      >
        {percentText(demand)}
      </span>
    </button>
  );
}

function ReactionRow({ reaction }: { reaction: ReactionDiff }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-[10px]">
      <span className="min-w-0 flex-1 truncate text-slate-400">{reaction.label}</span>
      <span className="font-mono tabular-nums text-slate-500">
        {formatNumber(reaction.force.a)}→{formatNumber(reaction.force.b)}
      </span>
      <span
        className={cn(
          "w-[52px] text-right font-mono font-semibold tabular-nums",
          trendClass(reaction.force.percent),
        )}
      >
        {percentText(reaction.force.percent)}
      </span>
    </div>
  );
}

export default function ComparePanel() {
  const open = useModelStore((state) => state.comparePanelOpen);
  const setOpen = useModelStore((state) => state.setComparePanelOpen);
  const model = useModelStore((state) => state.model);
  const sourceLabel = useModelStore((state) => state.sourceLabel);
  const samples = useModelStore((state) => state.samples);
  const compareModel = useModelStore((state) => state.compareModel);
  const compareSourceLabel = useModelStore((state) => state.compareSourceLabel);
  const compareLoading = useModelStore((state) => state.compareLoading);
  const compareError = useModelStore((state) => state.compareError);
  const compareResult = useModelStore((state) => state.compareResult);
  const compareCaseLabel = useModelStore((state) => state.compareCaseLabel);
  const compareResultError = useModelStore((state) => state.compareResultError);
  const comparison = useModelStore((state) => state.compareComparison);
  const compareView = useModelStore((state) => state.compareView);
  const setCompareView = useModelStore((state) => state.setCompareView);
  const compareHeatmap = useModelStore((state) => state.compareHeatmap);
  const setCompareHeatmap = useModelStore((state) => state.setCompareHeatmap);
  const loadCompareSample = useModelStore((state) => state.loadCompareSample);
  const loadCompareFromFile = useModelStore((state) => state.loadCompareFromFile);
  const clearCompare = useModelStore((state) => state.clearCompare);
  const selectFrame = useModelStore((state) => state.selectFrame);
  const fileInput = useRef<HTMLInputElement>(null);

  const units = model?.meta.units;

  const topFrames = useMemo(() => {
    if (!comparison) return [];
    return [...comparison.frames]
      .filter((frame) => Math.abs(frameDemandPercent(frame) ?? 0) > 0.05)
      .slice(0, 7);
  }, [comparison]);

  const topReactions = useMemo(() => {
    if (!comparison) return [];
    return [...comparison.reactions]
      .filter((reaction) => Math.abs(reaction.force.percent ?? 0) > 0.05)
      .sort(
        (a, b) =>
          Math.abs(b.force.percent ?? 0) - Math.abs(a.force.percent ?? 0),
      )
      .slice(0, 5);
  }, [comparison]);

  if (!open) return null;

  return (
    <aside className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-[336px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <GitCompareArrows size={15} className="text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-white">Comparar modelos</div>
          <div className="text-[9px] text-slate-500">
            A · base ↔ B · reparación / refuerzo
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={() => setOpen(false)}
          title="Cerrar comparador"
          aria-label="Cerrar comparador"
        >
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Modelo A · base
          </div>
          <div className="truncate text-[11px] font-medium text-slate-200">
            {sourceLabel ?? model?.meta.name ?? "Sin modelo base"}
          </div>
        </div>

        {!compareModel && (
          <>
            <div className="space-y-1.5">
              <button
                type="button"
                className="btn w-full justify-start"
                onClick={() => fileInput.current?.click()}
                disabled={!model || compareLoading}
              >
                <Upload size={13} />
                Cargar modelo B (JSON)
              </button>
              <select
                className="h-8 w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 text-[11px] text-slate-200 outline-none focus:border-sky-400/60"
                defaultValue=""
                disabled={!model || compareLoading || samples.length === 0}
                onChange={(event) => {
                  const entry = samples.find(
                    (sample) => sample.file === event.target.value,
                  );
                  if (entry) void loadCompareSample(entry);
                }}
                title="Cargar un ejemplo como modelo B"
              >
                <option value="" disabled>
                  o elige un ejemplo como B…
                </option>
                {samples.map((sample) => (
                  <option key={sample.file} value={sample.file}>
                    {sample.label}
                  </option>
                ))}
              </select>
              <div className="flex items-start gap-1.5 rounded-md bg-sky-400/5 px-2 py-1.5 text-[9px] leading-relaxed text-slate-500">
                <FileJson size={12} className="mt-0.5 shrink-0 text-sky-400/70" />
                <span>
                  También puedes soltar dos archivos JSON a la vez: el primero
                  será A y el segundo B.
                </span>
              </div>
            </div>
            {compareLoading && (
              <div className="text-[10px] text-sky-300">Cargando modelo B…</div>
            )}
            {compareError && (
              <div className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1.5 text-[10px] text-rose-200">
                {compareError}
              </div>
            )}
          </>
        )}

        {compareModel && (
          <>
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-300/80">
                  Modelo B · modificado
                </div>
                <span className="text-[9px] text-amber-300/60">
                  {compareModel.nodeOrder.length} nudos · {compareModel.frameOrder.length} barras
                </span>
              </div>
              <div className="truncate text-[11px] font-medium text-slate-100">
                {compareSourceLabel ?? compareModel.meta.name}
              </div>
              {compareCaseLabel && (
                <div className="truncate text-[9px] text-amber-200/60">
                  Caso resuelto: {compareCaseLabel}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                className={cn("btn h-7 text-[10px]", compareView === "overlay" && "btn-active")}
                onClick={() => setCompareView("overlay")}
                title="Superponer A y B en el mismo lienzo"
              >
                <Layers size={12} />
                Superpuesta
              </button>
              <button
                type="button"
                className={cn("btn h-7 text-[10px]", compareView === "split" && "btn-active")}
                onClick={() => setCompareView("split")}
                title="Vista dividida con cámaras sincronizadas"
              >
                <Columns2 size={12} />
                Dividida
              </button>
            </div>

            <button
              type="button"
              className={cn(
                "btn h-7 w-full justify-between text-[10px]",
                compareHeatmap && "btn-active",
              )}
              onClick={() => setCompareHeatmap(!compareHeatmap)}
              title="Colorear las barras de A según el cambio de demanda"
              disabled={!comparison}
            >
              <span className="inline-flex items-center gap-1.5">
                <Palette size={12} />
                Mapa de calor de demandas
              </span>
              <span className="text-[9px] text-slate-400">±50 %</span>
            </button>

            {compareResultError && (
              <div className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1.5 text-[10px] text-rose-200">
                {compareResultError}
              </div>
            )}
            {!compareResult && !compareResultError && (
              <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] text-slate-400">
                El modelo B no tiene resultados ni combinaciones resolubles para el
                caso activo.
              </div>
            )}

            {comparison && units && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <MetricCard
                    label="Despl. máximo"
                    value={comparison.summary.maxDisplacement}
                    unit={units.length}
                    hint={
                      comparison.summary.maxDisplacementNode.a &&
                      comparison.summary.maxDisplacementNode.b
                        ? `A: ${comparison.summary.maxDisplacementNode.a.label} · B: ${comparison.summary.maxDisplacementNode.b.label}`
                        : undefined
                    }
                  />
                  <MetricCard
                    label="Cortante basal"
                    value={comparison.summary.baseShear}
                    unit={units.force}
                  />
                  <MetricCard
                    label="Fuerza máx. barra"
                    value={comparison.summary.maxFrameForce}
                    unit={units.force}
                  />
                  <MetricCard
                    label="Momento máx. barra"
                    value={comparison.summary.maxFrameMoment}
                    unit={`${units.force}·${units.length}`}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md bg-white/[0.02] px-2 py-1 text-[9px] text-slate-500">
                  <span>
                    <b className="text-emerald-300">{comparison.summary.frameDecreaseCount}</b>{" "}
                    reducen
                  </span>
                  <span>
                    <b className="text-rose-300">{comparison.summary.frameIncreaseCount}</b>{" "}
                    aumentan
                  </span>
                  <span>
                    <b className="text-slate-300">{comparison.summary.frameEqualCount}</b>{" "}
                    iguales
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded-md bg-white/[0.02] px-2 py-1 text-[9px] text-slate-500">
                  <span className="flex justify-between">
                    <span>Reacción vertical</span>
                    <b className={cn("font-mono", trendClass(comparison.summary.baseAxial.percent))}>
                      {percentText(comparison.summary.baseAxial.percent)}
                    </b>
                  </span>
                  <span className="flex justify-between">
                    <span>Momento basal</span>
                    <b className={cn("font-mono", trendClass(comparison.summary.baseMoment.percent))}>
                      {percentText(comparison.summary.baseMoment.percent)}
                    </b>
                  </span>
                  <span className="flex justify-between">
                    <span>Reacción máx.</span>
                    <b
                      className={cn(
                        "font-mono",
                        trendClass(comparison.summary.maxReactionForce.percent),
                      )}
                    >
                      {percentText(comparison.summary.maxReactionForce.percent)}
                    </b>
                  </span>
                  <span className="flex justify-between">
                    <span>Momento reacción</span>
                    <b
                      className={cn(
                        "font-mono",
                        trendClass(comparison.summary.maxReactionMoment.percent),
                      )}
                    >
                      {percentText(comparison.summary.maxReactionMoment.percent)}
                    </b>
                  </span>
                </div>

                <section>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Barras con mayor cambio
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {comparison.summary.frameCount} comunes
                    </span>
                  </div>
                  {topFrames.length > 0 ? (
                    <div className="space-y-px">
                      {topFrames.map((frame) => (
                        <FrameChangeRow
                          key={frame.frameId}
                          frame={frame}
                          onSelect={() => selectFrame(frame.frameId)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-1 text-[10px] text-slate-600">
                      Sin cambios de demanda apreciables.
                    </div>
                  )}
                </section>

                {topReactions.length > 0 && (
                  <section>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Reacciones con mayor cambio
                      </span>
                      <span className="text-[9px] text-slate-600">
                        {comparison.summary.reactionCount} apoyos
                      </span>
                    </div>
                    <div className="space-y-px">
                      {topReactions.map((reaction) => (
                        <ReactionRow
                          key={`${reaction.supportId}-${reaction.nodeId}`}
                          reaction={reaction}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <div className="rounded-md bg-white/[0.02] px-2 py-1 text-[9px] leading-relaxed text-slate-500">
                  Δ% = (B − A) / |A|. El mapa de calor satura a ±50 %: verde
                  reduce la demanda y rojo la aumenta.
                </div>
              </>
            )}

            <div className="flex items-center gap-1.5 border-t border-white/[0.07] pt-2">
              <button
                type="button"
                className="btn h-7 flex-1 text-[10px]"
                onClick={() => fileInput.current?.click()}
                disabled={compareLoading}
              >
                <Upload size={12} />
                Cambiar B
              </button>
              <button
                type="button"
                className="btn h-7 text-[10px]"
                onClick={() => downloadComparisonCsv()}
                disabled={!comparison}
                title="Descargar resumen comparativo en CSV"
              >
                <Download size={12} />
                CSV A/B
              </button>
              <button
                type="button"
                className="btn h-7 px-2 text-[10px] text-rose-200 hover:border-rose-400/40 hover:bg-rose-400/10"
                onClick={clearCompare}
                title="Quitar el modelo B"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {compareError && (
              <div className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1.5 text-[10px] text-rose-200">
                {compareError}
              </div>
            )}
          </>
        )}

        {!model && (
          <div className="text-[10px] text-slate-500">
            Carga primero un modelo base A para poder comparar.
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadCompareFromFile(file);
        }}
      />
    </aside>
  );
}

/** Leyenda flotante del mapa de calor, visible aunque el panel esté cerrado. */
export function CompareLegend() {
  const compareEnabled = useModelStore((state) => state.compareEnabled);
  const compareModel = useModelStore((state) => state.compareModel);
  const compareHeatmap = useModelStore((state) => state.compareHeatmap);
  if (!compareEnabled || !compareModel || !compareHeatmap) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1 text-[9px] text-slate-400 backdrop-blur sm:flex">
      <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
        Demanda A→B
      </span>
      <span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-emerald-500 via-slate-500 to-rose-500" />
      <span className="font-mono">−50 %</span>
      <span className="text-slate-600">·</span>
      <span className="font-mono">0</span>
      <span className="text-slate-600">·</span>
      <span className="font-mono">+50 %</span>
    </div>
  );
}
