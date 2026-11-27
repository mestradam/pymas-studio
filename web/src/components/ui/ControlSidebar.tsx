import { useMemo } from "react";
import { Info, Layers, X } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { buildLegend } from "../../engine/colors";
import { patternLoadCount } from "../../engine/parser";
import { autoDeformationScale } from "../../engine/deformation";
import {
  autoDiagramScale,
  FORCE_COMPONENTS,
  FORCE_LABELS,
} from "../../engine/diagrams";
import { formatNumber } from "../../engine/geometry";
import { HEATMAP_LABELS } from "../../engine/heatmap";
import { cn } from "../../lib/utils";
import VisibilityPanel from "./VisibilityPanel";

const MODEL_TYPE_LABELS: Record<string, string> = {
  beam: "Viga",
  bar: "Barra axial",
  space_frame: "Pórtico espacial",
  space_truss: "Cercha espacial",
};

const RESULT_MODE_OPTIONS = [
  ["pattern", "Patrón"],
  ["combination", "Combinación"],
  ["env_max", "ENV MAX"],
  ["env_min", "ENV MIN"],
] as const;

const DEFORMATION_HEATMAP_OPTIONS = [
  ["magnitude", "|U|"],
  ["ux", "ux"],
  ["uy", "uy"],
  ["uz", "uz"],
  ["rx", "rx"],
  ["ry", "ry"],
  ["rz", "rz"],
  ["drift", "Deriva"],
] as const;

const FORCE_HEATMAP_OPTIONS = FORCE_COMPONENTS.map(
  (component) => [component, FORCE_LABELS[component]] as const,
);

function Toggle({
  label,
  checked,
  onChange,
  shortcut,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Tecla del atajo, mostrada en gris junto al interruptor. */
  shortcut?: string;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      {shortcut && (
        <kbd
          className="ml-auto mr-2 font-mono text-[9px] text-slate-600"
          title={`Atajo: tecla ${shortcut}`}
        >
          {shortcut}
        </kbd>
      )}
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
  const activePatternId = useModelStore((state) => state.activePatternId);
  const resultMode = useModelStore((state) => state.resultMode);
  const activeCombinationId = useModelStore((state) => state.activeCombinationId);
  const activeCombinationIds = useModelStore((state) => state.activeCombinationIds);
  const computedResult = useModelStore((state) => state.computedResult);
  const resultError = useModelStore((state) => state.resultError);
  const showDeformed = useModelStore((state) => state.showDeformed);
  const deformationScale = useModelStore((state) => state.deformationScale);
  const showGhost = useModelStore((state) => state.showGhost);
  const deformedRenderMode = useModelStore((state) => state.deformedRenderMode);
  const setDeformedRenderMode = useModelStore(
    (state) => state.setDeformedRenderMode,
  );
  const animateDeformation = useModelStore((state) => state.animateDeformation);
  const heatmapMode = useModelStore((state) => state.heatmapMode);
  const showForceDiagrams = useModelStore((state) => state.showForceDiagrams);
  const diagramComponents = useModelStore((state) => state.diagramComponents);
  const diagramScale = useModelStore((state) => state.diagramScale);
  const showDiagramLabels = useModelStore((state) => state.showDiagramLabels);
  const showReactions = useModelStore((state) => state.showReactions);
  const renderMode = useModelStore((state) => state.renderMode);
  const colorMode = useModelStore((state) => state.colorMode);
  const opacity = useModelStore((state) => state.opacity);
  const sectionScale = useModelStore((state) => state.sectionScale);
  const loadScale = useModelStore((state) => state.loadScale);
  const loadArrowMode = useModelStore((state) => state.loadArrowMode);
  const showNodes = useModelStore((state) => state.showNodes);
  const showLabels = useModelStore((state) => state.showLabels);
  const showSupports = useModelStore((state) => state.showSupports);
  const showReleases = useModelStore((state) => state.showReleases);
  const showLoads = useModelStore((state) => state.showLoads);
  const showGrid = useModelStore((state) => state.showGrid);
  const setActivePattern = useModelStore((state) => state.setActivePattern);
  const setResultMode = useModelStore((state) => state.setResultMode);
  const setActiveCombination = useModelStore((state) => state.setActiveCombination);
  const toggleCombination = useModelStore((state) => state.toggleCombination);
  const setActiveCombinations = useModelStore((state) => state.setActiveCombinations);
  const setDeformationScale = useModelStore((state) => state.setDeformationScale);
  const setShowDeformed = useModelStore((state) => state.setShowDeformed);
  const setShowGhost = useModelStore((state) => state.setShowGhost);
  const setAnimateDeformation = useModelStore((state) => state.setAnimateDeformation);
  const setHeatmapMode = useModelStore((state) => state.setHeatmapMode);
  const setShowForceDiagrams = useModelStore((state) => state.setShowForceDiagrams);
  const toggleDiagramComponent = useModelStore((state) => state.toggleDiagramComponent);
  const setDiagramScale = useModelStore((state) => state.setDiagramScale);
  const setShowDiagramLabels = useModelStore((state) => state.setShowDiagramLabels);
  const setShowReactions = useModelStore((state) => state.setShowReactions);
  const setRenderMode = useModelStore((state) => state.setRenderMode);
  const setColorMode = useModelStore((state) => state.setColorMode);
  const setOpacity = useModelStore((state) => state.setOpacity);
  const setSectionScale = useModelStore((state) => state.setSectionScale);
  const setLoadScale = useModelStore((state) => state.setLoadScale);
  const setLoadArrowMode = useModelStore((state) => state.setLoadArrowMode);
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

  const autoDeformFactor = useMemo(
    () =>
      model && computedResult
        ? autoDeformationScale(model, computedResult, 0.08)
        : 1,
    [model, computedResult],
  );

  const autoDiagramFactor = useMemo(
    () =>
      model && computedResult && diagramComponents.length > 0
        ? autoDiagramScale(model, computedResult, {
            targetFraction: 0.12,
            components: diagramComponents,
          })
        : 1,
    [model, computedResult, diagramComponents],
  );

  const activeCaseLabel = useMemo(() => {
    if (!model) return "—";
    if (resultMode === "pattern") {
      return activePatternId
        ? model.loadPatterns[activePatternId]?.name ?? activePatternId
        : "Sin patrón";
    }
    if (resultMode === "combination") {
      return activeCombinationId
        ? model.loadCombinations[activeCombinationId]?.name ?? activeCombinationId
        : "Sin combinación";
    }
    const total = model.loadCombinationOrder.length;
    return `${resultMode === "env_max" ? "ENV MAX" : "ENV MIN"} · ${
      activeCombinationIds.length
    }/${total} combinaciones`;
  }, [
    model,
    resultMode,
    activePatternId,
    activeCombinationId,
    activeCombinationIds,
  ]);

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
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="panel-title">Caso de resultados</h2>
                <span className="max-w-[150px] truncate text-[10px] text-slate-500">
                  {activeCaseLabel}
                </span>
              </div>
              <div className="seg w-full">
                {RESULT_MODE_OPTIONS.map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "seg-btn flex-1 px-0 text-[9px]",
                      resultMode === mode && "seg-btn-active",
                    )}
                    onClick={() => setResultMode(mode)}
                    title={label}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {model.loadCombinationOrder.length === 0 && resultMode !== "pattern" && (
                <div className="mt-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1.5 text-[10px] text-amber-200/80">
                  El modelo no define combinaciones de carga.
                </div>
              )}

              {resultMode === "pattern" &&
                (model.loadPatternOrder.length > 0 ? (
                  <div className="mt-1.5 space-y-1">
                    <select
                      className="h-7 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] font-medium text-slate-200 outline-none transition hover:border-white/20 focus:border-sky-400/60"
                      value={activePatternId ?? ""}
                      onChange={(event) => setActivePattern(event.target.value)}
                    >
                      <option value="" disabled>
                        Selecciona un patrón
                      </option>
                      {model.loadPatternOrder.map((id) => {
                        const pattern = model.loadPatterns[id];
                        if (!pattern) return null;
                        return (
                          <option key={id} value={id}>
                            {pattern.name} · {patternLoadCount(pattern)} cargas
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[9px] leading-relaxed text-slate-500">
                      Resultado tomado de los datos exportados. Los vectores de
                      carga corresponden a este patrón.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 rounded-lg border border-white/[0.06] px-2 py-1.5 text-[10px] text-slate-500">
                    El modelo no define patrones de carga.
                  </div>
                ))}

              {resultMode === "combination" && model.loadCombinationOrder.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <select
                    className="h-7 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] font-medium text-slate-200 outline-none transition hover:border-white/20 focus:border-sky-400/60"
                    value={activeCombinationId ?? ""}
                    onChange={(event) => setActiveCombination(event.target.value)}
                  >
                    <option value="" disabled>
                      Selecciona una combinación
                    </option>
                    {model.loadCombinationOrder.map((id) => {
                      const combination = model.loadCombinations[id];
                      return (
                        <option key={id} value={id}>
                          {combination?.name ?? id}
                        </option>
                      );
                    })}
                  </select>
                  {activeCombinationId && (
                    <div className="truncate font-mono text-[9px] text-slate-500">
                      {Object.entries(
                        model.loadCombinations[activeCombinationId]?.factors ?? {},
                      )
                        .map(([patternId, factor]) => `${factor}·${patternId}`)
                        .join(" + ")}
                    </div>
                  )}
                </div>
              )}

              {(resultMode === "env_max" || resultMode === "env_min") &&
                model.loadCombinationOrder.length > 0 && (
                  <div className="mt-1.5">
                    <div className="max-h-44 space-y-0.5 overflow-y-auto pr-1">
                      {model.loadCombinationOrder.map((id) => {
                        const combination = model.loadCombinations[id];
                        const checked = activeCombinationIds.includes(id);
                        return (
                          <label
                            key={id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md border px-1.5 py-1 text-[10px] transition",
                              checked
                                ? "border-sky-400/30 bg-sky-400/[0.07] text-slate-200"
                                : "border-white/[0.05] text-slate-500 hover:bg-white/[0.04]",
                            )}
                            title={Object.entries(combination?.factors ?? {})
                              .map(([patternId, factor]) => `${factor}·${patternId}`)
                              .join(" + ")}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCombination(id)}
                              className="h-3 w-3 shrink-0 cursor-pointer accent-sky-500"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {combination?.name ?? id}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        className="btn py-1 text-[9px]"
                        onClick={() => setActiveCombinations(model.loadCombinationOrder)}
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        className="btn py-1 text-[9px]"
                        onClick={() => setActiveCombinations([])}
                      >
                        Ninguna
                      </button>
                    </div>
                  </div>
                )}

              {resultError && (
                <div className="mt-1.5 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-2 py-1.5 text-[10px] text-rose-200/80">
                  {resultError}
                </div>
              )}
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="panel-title">Deformada elástica</h2>
                <span className="font-mono text-[10px] text-slate-500">
                  {formatNumber(autoDeformFactor * deformationScale)}×
                </span>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
                <Toggle
                  label="Mostrar deformada"
                  shortcut="D"
                  checked={showDeformed}
                  onChange={setShowDeformed}
                />
                <div className="seg my-1 w-full">
                  {(
                    [
                      ["line", "Línea"],
                      ["extruded", "Secciones extruidas"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      disabled={!showDeformed}
                      className={cn(
                        "seg-btn flex-1",
                        deformedRenderMode === id && "seg-btn-active",
                      )}
                      onClick={() => setDeformedRenderMode(id)}
                      title="Línea ↔ secciones extruidas · tecla X"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Toggle
                  label="Estructura fantasma"
                  checked={showGhost}
                  onChange={setShowGhost}
                />
                <Toggle
                  label="Animación armónica"
                  shortcut="A"
                  checked={animateDeformation}
                  onChange={setAnimateDeformation}
                />
              </div>
              <div className="mt-2">
                <label className="field-label">
                  <span>Amplificación</span>
                  <span className="field-value">
                    {deformationScale.toFixed(2)}× auto
                  </span>
                </label>
                <input
                  type="range"
                  min={0.05}
                  max={5}
                  step={0.05}
                  value={deformationScale}
                  disabled={!showDeformed}
                  onChange={(event) =>
                    setDeformationScale(Number(event.target.value))
                  }
                />
                <div className="mt-0.5 text-[9px] text-slate-500">
                  factor {formatNumber(autoDeformFactor * deformationScale)} · auto{" "}
                  {formatNumber(autoDeformFactor)}
                </div>
              </div>
              <div className="mt-2">
                <div className="field-label">
                  <span>Mapa de calor</span>
                  <span className="field-value">{HEATMAP_LABELS[heatmapMode]}</span>
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                  Deformada
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {DEFORMATION_HEATMAP_OPTIONS.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn(
                        "btn px-0 py-1 text-[10px]",
                        heatmapMode === mode && "btn-active",
                      )}
                      onClick={() => setHeatmapMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[9px] uppercase tracking-wide text-slate-500">
                  Acciones internas
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {FORCE_HEATMAP_OPTIONS.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn(
                        "btn px-0 py-1 text-[10px]",
                        heatmapMode === mode && "btn-active",
                      )}
                      onClick={() => setHeatmapMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    className={cn(
                      "btn col-span-3 px-0 py-1 text-[10px]",
                      heatmapMode === "none" && "btn-active",
                    )}
                    onClick={() => setHeatmapMode("none")}
                  >
                    Plano
                  </button>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="panel-title">Diagramas de acciones internas</h2>
                <span className="font-mono text-[10px] text-slate-500">
                  {formatNumber(autoDiagramFactor * diagramScale)}×
                </span>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
                <Toggle
                  label="Mostrar diagramas 3D"
                  shortcut="M"
                  checked={showForceDiagrams}
                  onChange={setShowForceDiagrams}
                />
                <Toggle
                  label="Etiquetas de extremos"
                  checked={showDiagramLabels}
                  onChange={setShowDiagramLabels}
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {FORCE_COMPONENTS.map((component) => (
                  <button
                    key={component}
                    type="button"
                    className={cn(
                      "btn px-0 py-1 font-mono text-[10px]",
                      diagramComponents.includes(component) && "btn-active",
                    )}
                    onClick={() => toggleDiagramComponent(component)}
                  >
                    {FORCE_LABELS[component]}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[9px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-cyan-400" /> positivo
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-rose-400" /> negativo
                </span>
              </div>
              <div className="mt-2">
                <label className="field-label">
                  <span>Escala</span>
                  <span className="field-value">{diagramScale.toFixed(2)}× auto</span>
                </label>
                <input
                  type="range"
                  min={0.05}
                  max={5}
                  step={0.05}
                  value={diagramScale}
                  disabled={!showForceDiagrams}
                  onChange={(event) => setDiagramScale(Number(event.target.value))}
                />
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
                      title="Extruido ↔ alambre · tecla E"
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

            <VisibilityPanel model={model} />

            <section>
              <h2 className="panel-title mb-1.5">Capas</h2>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
                <Toggle label="Nudos" shortcut="N" checked={showNodes} onChange={setShowNodes} />
                <Toggle
                  label="Etiquetas de nudos"
                  shortcut="C"
                  checked={showLabels}
                  onChange={setShowLabels}
                />
                <Toggle
                  label="Apoyos"
                  shortcut="S"
                  checked={showSupports}
                  onChange={setShowSupports}
                />
                <Toggle
                  label="Rótulas / liberaciones"
                  shortcut="J"
                  checked={showReleases}
                  onChange={setShowReleases}
                />
                <Toggle
                  label="Vectores de carga"
                  shortcut="L"
                  checked={showLoads}
                  onChange={setShowLoads}
                />
                {showLoads && (
                  <div className="seg mx-1 mb-1 w-[calc(100%-0.5rem)]">
                    {(
                      [
                        ["tip", "Punta en el elemento"],
                        ["origin", "Origen en el elemento"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={cn(
                          "seg-btn flex-1 px-0 text-[9px]",
                          loadArrowMode === id && "seg-btn-active",
                        )}
                        onClick={() => setLoadArrowMode(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <Toggle
                  label="Reacciones en apoyos"
                  shortcut="R"
                  checked={showReactions}
                  onChange={setShowReactions}
                />
                <Toggle label="Grilla XY" shortcut="G" checked={showGrid} onChange={setShowGrid} />
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
