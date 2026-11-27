import { useMemo } from "react";
import { Box, CircleDot, EyeOff, Focus, X } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { formatNumber } from "../../engine/geometry";
import {
  FRAME_CHART_LABELS,
  buildFrameChartSeries,
  interpolateSeriesAt,
  type FrameChartSeries,
} from "../../engine/inspection";
import type {
  Displacement6D,
  ReleaseFlags,
  Vector6D,
} from "../../types/pymas";
import { cn } from "../../lib/utils";

const RELEASE_KEYS: Array<[keyof ReleaseFlags, string]> = [
  ["axial", "axial"],
  ["shear_y", "cortante y"],
  ["shear_z", "cortante z"],
  ["torsion", "torsión"],
  ["bending_y", "flexión y"],
  ["bending_z", "flexión z"],
];

const FORCE_KEYS: Array<[keyof Vector6D, string]> = [
  ["fx", "Fx"],
  ["fy", "Fy"],
  ["fz", "Fz"],
  ["mx", "Mx"],
  ["my", "My"],
  ["mz", "Mz"],
];

const DISPLACEMENT_KEYS: Array<[keyof Displacement6D, string]> = [
  ["ux", "ux"],
  ["uy", "uy"],
  ["uz", "uz"],
  ["rx", "rx"],
  ["ry", "ry"],
  ["rz", "rz"],
];

const SUPPORT_LABELS: Record<string, string> = {
  fixed: "Empotrado",
  pinned: "Articulado",
  roller: "Rodillo",
  rotational: "Rotacional",
  free: "Libre",
};

function releaseList(flags: ReleaseFlags): string[] {
  return RELEASE_KEYS.filter(([key]) => flags[key]).map(([, label]) => label);
}

function SheetRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="contents">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-[10px] text-slate-200",
          mono && "font-mono tabular-nums",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function FrameChart({
  series,
  length,
  unit,
  station,
  onStation,
}: {
  series: FrameChartSeries;
  length: number;
  unit: string;
  station: number | null;
  onStation: (station: number | null) => void;
}) {
  const maxAbs = useMemo(() => {
    let maximum = 0;
    for (const value of series.values) {
      if (Number.isFinite(value)) maximum = Math.max(maximum, Math.abs(value));
    }
    return Math.max(maximum, 1e-12);
  }, [series]);

  const width = 200;
  const padding = 5;
  const usable = width - padding * 2;
  const zeroY = 26;
  const halfHeight = 18;

  const xAt = (value: number) =>
    padding + Math.min(1, Math.max(0, value)) * usable;
  const yAt = (value: number) =>
    zeroY - (Number.isFinite(value) ? value / maxAbs : 0) * halfHeight;

  const linePoints = series.stations
    .map(
      (entry, index) =>
        `${xAt(entry).toFixed(2)},${yAt(series.values[index] ?? 0).toFixed(2)}`,
    )
    .join(" ");

  const firstStation = series.stations[0] ?? 0;
  const lastStation = series.stations[series.stations.length - 1] ?? 1;
  const areaPath = `M ${xAt(firstStation).toFixed(2)} ${zeroY} L ${linePoints
    .split(" ")
    .join(" L ")} L ${xAt(lastStation).toFixed(2)} ${zeroY} Z`;

  const cursorValue =
    station === null
      ? null
      : interpolateSeriesAt(series.stations, series.values, station);
  const cursorX = station === null ? null : xAt(station);
  const cursorY = cursorValue === null ? zeroY : yAt(cursorValue);
  // El color del trazo sale de los tokens CSS para adaptarse al tema activo.
  const color = `var(--chart-${series.key})`;

  const handlePointer = (
    event: React.PointerEvent<SVGSVGElement>,
    leaving = false,
  ) => {
    if (leaving) {
      onStation(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const viewBoxX =
      ((event.clientX - rect.left) / rect.width) * width;
    onStation(Math.min(1, Math.max(0, (viewBoxX - padding) / usable)));
  };

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 pb-1 pt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-mono text-[10px] font-medium"
          style={{ color }}
        >
          {FRAME_CHART_LABELS[series.key]}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-slate-300">
          {cursorValue === null
            ? `máx ${formatNumber(maxAbs)} ${unit}`
            : `${formatNumber(cursorValue)} ${unit}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} 52`}
        preserveAspectRatio="none"
        className="mt-0.5 h-[52px] w-full cursor-crosshair touch-none"
        role="img"
        aria-label={`${FRAME_CHART_LABELS[series.key]} a lo largo de la barra`}
        onPointerMove={(event) => handlePointer(event)}
        onPointerDown={(event) => handlePointer(event)}
        onPointerLeave={(event) => handlePointer(event, true)}
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--chart-zero)"
          strokeWidth={0.7}
        />
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY - halfHeight}
          y2={zeroY - halfHeight}
          stroke="var(--chart-grid)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY + halfHeight}
          y2={zeroY + halfHeight}
          stroke="var(--chart-grid)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
        <path d={areaPath} fill={color} opacity={0.13} />
        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {cursorX !== null && (
          <>
            <line
              x1={cursorX}
              x2={cursorX}
              y1={zeroY - halfHeight}
              y2={zeroY + halfHeight}
              stroke="var(--chart-cursor)"
              strokeWidth={0.7}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={cursorX}
              cy={cursorY}
              r={2.4}
              fill="var(--chart-dot-fill)"
              stroke="var(--chart-dot-stroke)"
              strokeWidth={0.8}
            />
          </>
        )}
      </svg>
      <div className="flex justify-between font-mono text-[8px] text-slate-600">
        <span>0</span>
        <span>
          {station === null
            ? `x = ${formatNumber(length)}`
            : `x = ${formatNumber(station * length)} · ξ ${station.toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}

function EndActionTable({
  endActions,
  units,
}: {
  endActions: { i: Vector6D; j: Vector6D } | null;
  units: { force: string; length: string };
}) {
  if (!endActions) {
    return (
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1.5 text-[10px] text-amber-200/80">
        El caso activo no exporta acciones en extremos para esta barra.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
      <table className="w-full border-collapse font-mono text-[9px] tabular-nums">
        <thead>
          <tr className="bg-white/[0.04] text-slate-400">
            <th className="whitespace-nowrap px-1.5 py-1 text-left font-medium">
              Extremo
            </th>
            {FORCE_KEYS.map(([key, label]) => (
              <th
                key={key}
                className="whitespace-nowrap px-1 py-1 text-right font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["i", "j"] as const).map((end) => (
            <tr key={end} className="border-t border-white/[0.05]">
              <td className="whitespace-nowrap px-1.5 py-1 text-left text-sky-300">
                {end}
              </td>
              {FORCE_KEYS.map(([key]) => (
                <td
                  key={key}
                  className="whitespace-nowrap px-1 py-1 text-right text-slate-200"
                >
                  {formatNumber(endActions[end][key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-white/[0.05] px-2 py-1 text-[9px] text-slate-500">
        Fuerzas en {units.force} · momentos en {units.force}·{units.length}
      </div>
    </div>
  );
}

export default function ElementInspector() {
  const model = useModelStore((state) => state.model);
  const selectedFrameId = useModelStore((state) => state.selectedFrameId);
  const selectedNodeId = useModelStore((state) => state.selectedNodeId);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const selectFrame = useModelStore((state) => state.selectFrame);
  const hideSelection = useModelStore((state) => state.hideSelection);
  const isolateSelection = useModelStore((state) => state.isolateSelection);
  const chartStation = useModelStore((state) => state.chartStation);
  const setChartStation = useModelStore((state) => state.setChartStation);
  const computedResult = useModelStore((state) => state.computedResult);
  const resultMode = useModelStore((state) => state.resultMode);
  const activePatternId = useModelStore((state) => state.activePatternId);
  const activeCombinationId = useModelStore((state) => state.activeCombinationId);
  const activeCombinationIds = useModelStore((state) => state.activeCombinationIds);

  const frame = selectedFrameId ? model?.frames[selectedFrameId] : undefined;
  const node = selectedNodeId ? model?.nodes[selectedNodeId] : undefined;

  const frameResult =
    frame && computedResult ? computedResult.frameResults[frame.id] : undefined;

  const series = useMemo(
    () =>
      model && frame && computedResult
        ? buildFrameChartSeries(model, computedResult, frame.id)
        : null,
    [model, frame, computedResult],
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
    return `${resultMode === "env_max" ? "ENV MAX" : "ENV MIN"} · ${
      activeCombinationIds.length
    }/${model.loadCombinationOrder.length}`;
  }, [
    model,
    resultMode,
    activePatternId,
    activeCombinationId,
    activeCombinationIds,
  ]);

  if (!model) return null;
  if (!frame && !node) return null;

  const units = model.meta.units;

  return (
    <aside className="absolute inset-y-0 left-0 z-30 flex w-[372px] max-w-[94vw] flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {frame ? (
            <Box size={14} className="shrink-0 text-cyan-300" />
          ) : (
            <CircleDot size={14} className="shrink-0 text-amber-300" />
          )}
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-100">
              {frame
                ? `Barra ${frame.name || frame.id}`
                : `Nudo ${node?.name || node?.id}`}
            </div>
            <div className="truncate text-[9px] text-slate-500">
              Inspector · {activeCaseLabel}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn h-7 w-7 px-0"
            onClick={hideSelection}
            title={frame ? "Ocultar barra (H)" : "Ocultar barras del nudo (H)"}
            aria-label="Ocultar"
          >
            <EyeOff size={14} />
          </button>
          <button
            type="button"
            className="btn h-7 w-7 px-0"
            onClick={isolateSelection}
            title={frame ? "Aislar barra (I)" : "Aislar barras del nudo (I)"}
            aria-label="Aislar"
          >
            <Focus size={14} />
          </button>
          <button
            type="button"
            className="btn h-7 w-7 px-0"
            onClick={clearSelection}
            title="Cerrar inspector (Esc)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {frame && (
          <>
            <section>
              <h2 className="panel-title mb-1.5">Ficha técnica</h2>
              <div className="grid grid-cols-[86px_1fr] gap-x-2 gap-y-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <SheetRow label="Barra" value={frame.name || frame.id} />
                <SheetRow
                  label="Nudo i"
                  value={
                    model.nodes[frame.nodeI]
                      ? model.nodes[frame.nodeI]?.name &&
                        model.nodes[frame.nodeI]?.name !== frame.nodeI
                        ? `${model.nodes[frame.nodeI]?.name} (${frame.nodeI})`
                        : frame.nodeI
                      : frame.nodeI
                  }
                />
                <SheetRow
                  label="Nudo j"
                  value={
                    model.nodes[frame.nodeJ]
                      ? model.nodes[frame.nodeJ]?.name &&
                        model.nodes[frame.nodeJ]?.name !== frame.nodeJ
                        ? `${model.nodes[frame.nodeJ]?.name} (${frame.nodeJ})`
                        : frame.nodeJ
                      : frame.nodeJ
                  }
                />
                <SheetRow
                  label="Longitud L"
                  value={`${formatNumber(frame.length)} ${units.length}`}
                />
                <SheetRow
                  label="Material"
                  value={
                    model.materials[frame.materialId]?.name ?? frame.materialId
                  }
                />
                <SheetRow
                  label="E"
                  value={`${formatNumber(
                    model.materials[frame.materialId]?.E ?? Number.NaN,
                  )} ${units.stress}`}
                />
                <SheetRow
                  label="Sección"
                  value={
                    model.sections[frame.sectionId]?.name ?? frame.sectionId
                  }
                />
                <SheetRow
                  label="A · Iy · Iz · J"
                  value={[
                    model.sections[frame.sectionId]?.A,
                    model.sections[frame.sectionId]?.Iy,
                    model.sections[frame.sectionId]?.Iz,
                    model.sections[frame.sectionId]?.J,
                  ]
                    .map((value) => formatNumber(value ?? Number.NaN))
                    .join(" · ")}
                />
                <SheetRow
                  label="Liberaciones i"
                  value={releaseList(frame.releaseI).join(", ") || "ninguna"}
                  mono={false}
                />
                <SheetRow
                  label="Liberaciones j"
                  value={releaseList(frame.releaseJ).join(", ") || "ninguna"}
                  mono={false}
                />
                <SheetRow
                  label="Ejes locales"
                  value={
                    frame.localAxesSource === "exported"
                      ? "exportados por pymas"
                      : "calculados por el visor"
                  }
                  mono={false}
                />
              </div>
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="panel-title">acciones en extremos</h2>
                <span className="truncate text-[9px] text-slate-500">
                  {activeCaseLabel}
                </span>
              </div>
              <EndActionTable
                endActions={frameResult?.endActions ?? null}
                units={units}
              />
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="panel-title">Gráficos 2D</h2>
                <span className="font-mono text-[9px] text-slate-500">
                  x ∈ [0, {formatNumber(frame.length)}] {units.length}
                </span>
              </div>
              {series ? (
                <>
                  {(
                    [
                      ["Acciones internas · ejes locales", ["force", "moment"]],
                      ["Movimientos · ejes globales", ["displacement", "rotation"]],
                    ] as const
                  ).map(([title, families]) => {
                    const group = series.filter((entry) =>
                      (families as readonly string[]).includes(entry.family),
                    );
                    if (group.length === 0) return null;
                    return (
                      <div key={title} className="mb-2">
                        <h3 className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">
                          {title}
                        </h3>
                        <div className="space-y-1.5">
                          {group.map((entry) => (
                            <FrameChart
                              key={entry.key}
                              series={entry}
                              length={frame.length}
                              unit={
                                entry.family === "force"
                                  ? units.force
                                  : entry.family === "moment"
                                    ? `${units.force}·${units.length}`
                                    : entry.family === "rotation"
                                      ? "rad"
                                      : units.length
                              }
                              station={chartStation}
                              onStation={setChartStation}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
                    Pasa el puntero sobre cualquier gráfico para mover el marcador
                    naranja en el modelo 3D. El cursor se sincroniza entre todos
                    los gráficos.
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1.5 text-[10px] text-amber-200/80">
                  El caso activo no tiene resultados para esta barra.
                </div>
              )}
            </section>
          </>
        )}

        {node && (
          <>
            <section>
              <h2 className="panel-title mb-1.5">Ficha del nudo</h2>
              <div className="grid grid-cols-[86px_1fr] gap-x-2 gap-y-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <SheetRow label="Nudo" value={node.name || node.id} />
                <SheetRow label="x" value={`${formatNumber(node.x)} ${units.length}`} />
                <SheetRow label="y" value={`${formatNumber(node.y)} ${units.length}`} />
                <SheetRow label="z" value={`${formatNumber(node.z)} ${units.length}`} />
                {model.supports[node.id] ? (
                  <>
                    <SheetRow
                      label="Apoyo"
                      value={
                        SUPPORT_LABELS[model.supports[node.id]?.kind ?? "free"] ??
                        model.supports[node.id]?.kind ??
                        "—"
                      }
                      mono={false}
                    />
                    <SheetRow
                      label="GDL restringidos"
                      value={
                        (
                          ["ux", "uy", "uz", "rx", "ry", "rz"] as const
                        ).filter((dof) => model.supports[node.id]?.[dof])
                          .join(", ") || "ninguno"
                      }
                    />
                  </>
                ) : (
                  <SheetRow label="Apoyo" value="sin apoyo" mono={false} />
                )}
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-1.5">Desplazamiento nodal</h2>
              {computedResult?.nodalDisplacements[node.id] ? (
                <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                  <table className="w-full border-collapse font-mono text-[10px] tabular-nums">
                    <thead>
                      <tr className="bg-white/[0.04] text-slate-400">
                        {DISPLACEMENT_KEYS.map(([key, label]) => (
                          <th key={key} className="px-1.5 py-1 text-right font-medium">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {DISPLACEMENT_KEYS.map(([key]) => (
                          <td
                            key={key}
                            className="px-1.5 py-1 text-right text-slate-200"
                          >
                            {formatNumber(
                              computedResult.nodalDisplacements[node.id]?.[key] ??
                                Number.NaN,
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                  <div className="border-t border-white/[0.05] px-2 py-1 text-[9px] text-slate-500">
                    Translaciones en {units.length} · giros en rad
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-white/[0.07] px-2 py-1.5 text-[10px] text-slate-500">
                  El caso activo no tiene desplazamientos nodales.
                </div>
              )}
            </section>

            {model.supports[node.id] && (
              <section>
                <h2 className="panel-title mb-1.5">Reacción en el apoyo</h2>
                {computedResult?.reactions[node.id] ? (
                  <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                    <table className="w-full border-collapse font-mono text-[10px] tabular-nums">
                      <thead>
                        <tr className="bg-white/[0.04] text-slate-400">
                          {FORCE_KEYS.map(([key, label]) => (
                            <th
                              key={key}
                              className="px-1.5 py-1 text-right font-medium"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {FORCE_KEYS.map(([key]) => (
                            <td
                              key={key}
                              className="px-1.5 py-1 text-right text-slate-200"
                            >
                              {formatNumber(
                                computedResult.reactions[node.id]?.[key] ??
                                  Number.NaN,
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                    <div className="border-t border-white/[0.05] px-2 py-1 text-[9px] text-slate-500">
                      Fuerzas en {units.force} · momentos en {units.force}·
                      {units.length}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/[0.07] px-2 py-1.5 text-[10px] text-slate-500">
                    El caso activo no tiene reacciones en este nudo.
                  </div>
                )}
              </section>
            )}

            <section>
              <h2 className="panel-title mb-1.5">Barras conectadas</h2>
              <div className="space-y-1">
                {model.frameOrder.flatMap((frameId) => {
                  const entry = model.frames[frameId];
                  if (
                    !entry ||
                    (entry.nodeI !== node.id && entry.nodeJ !== node.id)
                  ) {
                    return [];
                  }
                  return [
                    <button
                      key={entry.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-left text-[10px] text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
                      onClick={() => selectFrame(entry.id)}
                    >
                      <span className="truncate">{entry.name || entry.id}</span>
                      <span className="shrink-0 font-mono text-[9px] text-slate-500">
                        {formatNumber(entry.length)} {units.length}
                      </span>
                    </button>,
                  ];
                })}
                {!model.frameOrder.some((frameId) => {
                  const entry = model.frames[frameId];
                  return entry && (entry.nodeI === node.id || entry.nodeJ === node.id);
                }) && (
                  <div className="rounded-lg border border-white/[0.07] px-2 py-1.5 text-[10px] text-slate-500">
                    No hay barras conectadas.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
