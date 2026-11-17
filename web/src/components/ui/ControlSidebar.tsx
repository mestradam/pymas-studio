import { useMemo } from "react";
import { Info, Layers, X } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { buildLegend } from "../../engine/colors";
import { patternLoadCount } from "../../engine/parser";
import { cn } from "../../lib/utils";

const MODEL_TYPE_LABELS: Record<string, string> = {
  beam: "Viga",
  bar: "Barra axial",
  space_frame: "Pórtico espacial",
  space_truss: "Cercha espacial",
};

const VIEW_OPTIONS = [
  ["iso", "3D"],
  ["plan", "XY"],
  ["front", "XZ"],
  ["side", "YZ"],
] as const;

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-sky-500"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
      <div className="font-mono text-sm tabular-nums text-slate-100">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export default function ControlSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const model = useModelStore((state) => state.model);
  const sourceFile = useModelStore((state) => state.sourceFile);
  const samples = useModelStore((state) => state.samples);
  const loadingSamples = useModelStore((state) => state.loadingSamples);
  const loadSample = useModelStore((state) => state.loadSample);
  const activePatternId = useModelStore((state) => state.activePatternId);
  const view = useModelStore((state) => state.view);
  const setView = useModelStore((state) => state.setView);
  const projection = useModelStore((state) => state.projection);
  const toggleProjection = useModelStore((state) => state.toggleProjection);
  const renderMode = useModelStore((state) => state.renderMode);
  const colorMode = useModelStore((state) => state.colorMode);
  const opacity = useModelStore((state) => state.opacity);
  const sectionScale = useModelStore((state) => state.sectionScale);
  const loadScale = useModelStore((state) => state.loadScale);
  const showNodes = useModelStore((state) => state.showNodes);
  const showLabels = useModelStore((state) => state.showLabels);
  const showSupports = useModelStore((state) => state.showSupports);
  const showReleases = useModelStore((state) => state.showReleases);
  const showLoads = useModelStore((state) => state.showLoads);
  const showGrid = useModelStore((state) => state.showGrid);
  const setActivePattern = useModelStore((state) => state.setActivePattern);
  const setRenderMode = useModelStore((state) => state.setRenderMode);
  const setColorMode = useModelStore((state) => state.setColorMode);
  const setOpacity = useModelStore((state) => state.setOpacity);
  const setSectionScale = useModelStore((state) => state.setSectionScale);
  const setLoadScale = useModelStore((state) => state.setLoadScale);
  const setShowNodes = useModelStore((state) => state.setShowNodes);
  const setShowLabels = useModelStore((state) => state.setShowLabels);
  const setShowSupports = useModelStore((state) => state.setShowSupports);
  const setShowReleases = useModelStore((state) => state.setShowReleases);
  const setShowLoads = useModelStore((state) => state.setShowLoads);
  const setShowGrid = useModelStore((state) => state.setShowGrid);

  const legend = useMemo(
    () => (model ? buildLegend(model, colorMode) : []),
    [model, colorMode],
  );

  const releaseEnds = useMemo(() => {
    if (!model) return 0;
    let total = 0;
    for (const frame of Object.values(model.frames)) {
      if (Object.values(frame.releaseI).some(Boolean)) total += 1;
      if (Object.values(frame.releaseJ).some(Boolean)) total += 1;
    }
    return total;
  }, [model]);

  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex w-[340px] max-w-[90vw] flex-col border-l border-white/10 bg-slate-950/95 backdrop-blur-xl transition-transform duration-200 lg:relative lg:z-auto lg:max-w-none lg:translate-x-0",
        open ? "translate-x-0" : "pointer-events-none translate-x-full lg:hidden",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-sky-300" />
          <span className="text-xs font-semibold text-slate-100">Control de escena</span>
        </div>
        <button
          type="button"
          className="btn h-7 w-7 px-0 lg:hidden"
          onClick={onClose}
          title="Cerrar panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {!model ? (
          <div className="flex items-start gap-2 rounded-lg border border-sky-400/20 bg-sky-400/5 p-3 text-xs leading-relaxed text-slate-300">
            <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
            <span>
              Carga un modelo para habilitar los controles de patrones, escalas y capas.
            </span>
          </div>
        ) : (
          <>
            <section>
              <div className="panel p-2.5">
                <div className="truncate text-sm font-semibold text-white">
                  {model.meta.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <span className="chip text-sky-200">
                    {MODEL_TYPE_LABELS[model.meta.type] ?? model.meta.type}
                  </span>
                  <span className="chip">{model.meta.dofPerNode} GDL/nudo</span>
                  <span className="chip">
                    {model.meta.units.force} · {model.meta.units.length}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  <Stat label="Nudos" value={model.stats.nodes} />
                  <Stat label="Barras" value={model.stats.frames} />
                  <Stat label="Apoyos" value={model.stats.supports} />
                  <Stat label="Patrones" value={model.stats.patterns} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-slate-500">
                  <span>{plural(model.stats.materials, "material", "materiales")}</span>
                  <span>·</span>
                  <span>{plural(model.stats.sections, "sección", "secciones")}</span>
                  <span>·</span>
                  <span>{plural(releaseEnds, "extremo liberado", "extremos liberados")}</span>
                  <span>·</span>
                  <span>{plural(model.stats.combinations, "combinación", "combinaciones")}</span>
                </div>
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-1.5">Modelo de ejemplo</h2>
              <select
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11px] font-medium text-slate-200 outline-none transition hover:border-white/20 focus:border-sky-400/60"
                value={sourceFile ?? ""}
                disabled={loadingSamples}
                onChange={(event) => {
                  const entry = samples.find(
                    (sample) => sample.file === event.target.value,
                  );
                  if (entry) void loadSample(entry);
                }}
                title="Cambiar de modelo de ejemplo"
              >
                <option value="" disabled>
                  {sourceFile
                    ? "Archivo local / URL"
                    : "Modelo cargado desde URL"}
                </option>
                {samples.map((sample) => (
                  <option key={sample.file} value={sample.file}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <h2 className="panel-title mb-1.5">Vista de cámara</h2>
              <div className="grid grid-cols-4 gap-1">
                {VIEW_OPTIONS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn("btn px-0 py-1 text-[10px]", view === id && "btn-active")}
                    onClick={() => setView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn mt-1 w-full py-1 text-[10px]"
                onClick={toggleProjection}
              >
                Cámara {projection === "perspective" ? "perspectiva" : "ortográfica"}
              </button>
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="panel-title">Patrón de cargas</h2>
                <span className="text-[10px] text-slate-500">filtra los vectores</span>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[11px] transition",
                    activePatternId === null
                      ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                      : "border-white/[0.06] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]",
                  )}
                  onClick={() => setActivePattern(null)}
                >
                  <span>Ocultar cargas</span>
                  <span className="font-mono text-[10px]">—</span>
                </button>
                {model.loadPatternOrder.map((id) => {
                  const pattern = model.loadPatterns[id];
                  if (!pattern) return null;
                  const active = activePatternId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition",
                        active
                          ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
                          : "border-white/[0.06] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]",
                      )}
                      onClick={() => setActivePattern(id)}
                      title={pattern.name}
                    >
                      <span className="truncate">{pattern.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {patternLoadCount(pattern)} cargas
                      </span>
                    </button>
                  );
                })}
                {model.loadPatternOrder.length === 0 && (
                  <div className="rounded-lg border border-white/[0.06] px-2 py-2 text-[11px] text-slate-500">
                    El modelo no define patrones de carga.
                  </div>
                )}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-2">
              <div>
                <h2 className="panel-title mb-1.5">Geometría</h2>
                <div className="seg w-full">
                  {(
                    [
                      ["wire", "Alámbrico"],
                      ["extruded", "Extruido dy × dz"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "seg-btn flex-1",
                        renderMode === id && "seg-btn-active",
                      )}
                      onClick={() => setRenderMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="panel-title mb-1.5">Codificación de color</h2>
                <div className="seg w-full">
                  {(
                    [
                      ["material", "Material"],
                      ["section", "Sección"],
                      ["uniform", "Uniforme"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "seg-btn flex-1",
                        colorMode === id && "seg-btn-active",
                      )}
                      onClick={() => setColorMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-1.5">Leyenda</h2>
              <div className="space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                {legend.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 text-[11px] text-slate-300"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="min-w-0 flex-1 truncate" title={entry.label}>
                      {entry.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {entry.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2.5">
              <h2 className="panel-title">Escalas</h2>
              <div>
                <label className="field-label">
                  <span>Opacidad</span>
                  <span className="field-value">{Math.round(opacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.01}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
              </div>
              <div>
                <label className="field-label">
                  <span>Sección</span>
                  <span className="field-value">{sectionScale.toFixed(2)}×</span>
                </label>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={sectionScale}
                  onChange={(event) => setSectionScale(Number(event.target.value))}
                />
              </div>
              <div>
                <label className="field-label">
                  <span>Cargas</span>
                  <span className="field-value">{loadScale.toFixed(2)}×</span>
                </label>
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={loadScale}
                  onChange={(event) => setLoadScale(Number(event.target.value))}
                />
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-1.5">Capas</h2>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
                <Toggle label="Nudos" checked={showNodes} onChange={setShowNodes} />
                <Toggle
                  label="Etiquetas de nudos"
                  checked={showLabels}
                  onChange={setShowLabels}
                />
                <Toggle
                  label="Apoyos"
                  checked={showSupports}
                  onChange={setShowSupports}
                />
                <Toggle
                  label="Rótulas / liberaciones"
                  checked={showReleases}
                  onChange={setShowReleases}
                />
                <Toggle
                  label="Vectores de carga"
                  checked={showLoads}
                  onChange={setShowLoads}
                />
                <Toggle label="Grilla XY" checked={showGrid} onChange={setShowGrid} />
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-1.5">Unidades</h2>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-[11px] text-slate-400">
                <div className="flex justify-between">
                  <span>Fuerza</span>
                  <span className="font-mono text-slate-200">{model.meta.units.force}</span>
                </div>
                <div className="flex justify-between">
                  <span>Longitud</span>
                  <span className="font-mono text-slate-200">{model.meta.units.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tensión</span>
                  <span className="font-mono text-slate-200">{model.meta.units.stress}</span>
                </div>
                {model.meta.unitsAssumed && (
                  <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[10px] text-amber-300/80">
                    El JSON no declara unidades; se asumen kN, m y kPa.
                  </p>
                )}
              </div>
            </section>

            {model.warnings.length > 0 && (
              <details className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-2">
                <summary className="cursor-pointer text-[11px] font-medium text-amber-200">
                  Advertencias del parser ({model.warnings.length})
                </summary>
                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto pr-1 text-[10px] leading-relaxed text-amber-100/70">
                  {model.warnings.map((warning, index) => (
                    <li key={`${index}-${warning.slice(0, 12)}`}>• {warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 px-3 py-2 text-[10px] leading-relaxed text-slate-600">
        Procesamiento 100 % local · sin servidor · compatible con GitHub Pages
      </div>
    </aside>
  );
}
