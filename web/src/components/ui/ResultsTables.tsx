import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, Table2, X } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { formatNumber } from "../../engine/geometry";
import { frameForceSummaries, type FrameForceSummary } from "../../engine/inspection";
import { cn } from "../../lib/utils";

type TableTab = "displacements" | "reactions" | "frames";

interface SortState {
  key: string;
  dir: 1 | -1;
}

const TABS: Array<{ id: TableTab; label: string }> = [
  { id: "displacements", label: "Desplazamientos nodales" },
  { id: "reactions", label: "Reacciones en apoyos" },
  { id: "frames", label: "Fuerzas máximas por barra" },
];

const SUPPORT_LABELS: Record<string, string> = {
  fixed: "Empotrado",
  pinned: "Articulado",
  roller: "Rodillo",
  rotational: "Rotacional",
  free: "Libre",
};

type Row = Record<string, string | number>;

function sortRows<T extends Row>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const comparison =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""), "es", {
            numeric: true,
            sensitivity: "base",
          });
    return comparison * sort.dir;
  });
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  title,
}: {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
  title?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      className={cn(
        "whitespace-nowrap px-2 py-1.5 font-medium",
        align === "left" ? "text-left" : "text-right",
      )}
      title={title ?? `Ordenar por ${label}`}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 transition hover:text-slate-100",
          active ? "text-sky-200" : "text-slate-400",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active &&
          (sort?.dir === 1 ? (
            <ArrowUp size={10} className="shrink-0" />
          ) : (
            <ArrowDown size={10} className="shrink-0" />
          ))}
      </button>
    </th>
  );
}

interface DisplacementRow extends Row {
  nodeId: string;
  label: string;
  support: string;
  supportLabel: string;
  ux: number;
  uy: number;
  uz: number;
  rx: number;
  ry: number;
  rz: number;
  magnitude: number;
}

interface ReactionRow extends Row {
  supportId: string;
  nodeId: string;
  label: string;
  support: string;
  supportLabel: string;
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
  force: number;
  moment: number;
}

interface FrameRow extends Row {
  frameId: string;
  label: string;
  materialName: string;
  sectionName: string;
  axial: number;
  shearY: number;
  shearZ: number;
  torsion: number;
  momentY: number;
  momentZ: number;
  maxForce: number;
  maxMoment: number;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      className="h-8 min-w-[130px] rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11px] font-medium text-slate-200 outline-none transition hover:border-white/20 focus:border-sky-400/60"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      title={label}
      aria-label={label}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function ResultsTables() {
  const model = useModelStore((state) => state.model);
  const computedResult = useModelStore((state) => state.computedResult);
  const resultsTablesOpen = useModelStore((state) => state.resultsTablesOpen);
  const setResultsTablesOpen = useModelStore((state) => state.setResultsTablesOpen);
  const selectFrame = useModelStore((state) => state.selectFrame);
  const selectNode = useModelStore((state) => state.selectNode);
  const resultMode = useModelStore((state) => state.resultMode);
  const activePatternId = useModelStore((state) => state.activePatternId);
  const activeCombinationId = useModelStore((state) => state.activeCombinationId);
  const activeCombinationIds = useModelStore((state) => state.activeCombinationIds);

  const [tab, setTab] = useState<TableTab>("displacements");
  const [query, setQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [supportFilter, setSupportFilter] = useState("");
  const [sorts, setSorts] = useState<Record<TableTab, SortState | null>>({
    displacements: { key: "magnitude", dir: -1 },
    reactions: { key: "force", dir: -1 },
    frames: { key: "maxForce", dir: -1 },
  });

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

  const materialOptions = useMemo(
    () =>
      Object.values(model?.materials ?? {})
        .map((material) => ({
          value: material.id,
          label: material.name || material.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [model],
  );

  const sectionOptions = useMemo(
    () =>
      Object.values(model?.sections ?? {})
        .map((section) => ({
          value: section.id,
          label: section.name || section.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [model],
  );

  const supportOptions = useMemo(() => {
    const kinds = new Set<string>();
    for (const support of Object.values(model?.supports ?? {})) {
      kinds.add(support.kind);
    }
    return [...kinds]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((kind) => ({
        value: kind,
        label: SUPPORT_LABELS[kind] ?? kind,
      }));
  }, [model]);

  const displacementRows = useMemo<DisplacementRow[]>(() => {
    if (!model || !computedResult) return [];
    const rows: DisplacementRow[] = [];
    for (const nodeId of model.nodeOrder) {
      const node = model.nodes[nodeId];
      const displacement = computedResult.nodalDisplacements[nodeId];
      if (!node || !displacement) continue;
      const support = model.supports[nodeId];
      rows.push({
        nodeId,
        label: node.name || node.id,
        support: support?.kind ?? "free",
        supportLabel: SUPPORT_LABELS[support?.kind ?? "free"] ?? "Libre",
        ux: displacement.ux,
        uy: displacement.uy,
        uz: displacement.uz,
        rx: displacement.rx,
        ry: displacement.ry,
        rz: displacement.rz,
        magnitude: Math.hypot(displacement.ux, displacement.uy, displacement.uz),
      });
    }
    return rows;
  }, [model, computedResult]);

  const reactionRows = useMemo<ReactionRow[]>(() => {
    if (!model || !computedResult) return [];
    const rows: ReactionRow[] = [];
    for (const support of Object.values(model.supports)) {
      const reaction = computedResult.reactions[support.node];
      const node = model.nodes[support.node];
      if (!reaction || !node) continue;
      rows.push({
        supportId: support.id,
        nodeId: support.node,
        label: node.name || node.id,
        support: support.kind,
        supportLabel: SUPPORT_LABELS[support.kind] ?? support.kind,
        fx: reaction.fx,
        fy: reaction.fy,
        fz: reaction.fz,
        mx: reaction.mx,
        my: reaction.my,
        mz: reaction.mz,
        force: Math.hypot(reaction.fx, reaction.fy, reaction.fz),
        moment: Math.hypot(reaction.mx, reaction.my, reaction.mz),
      });
    }
    return rows;
  }, [model, computedResult]);

  const frameRows = useMemo<FrameRow[]>(() => {
    if (!model || !computedResult) return [];
    return frameForceSummaries(model, computedResult).map(
      (summary: FrameForceSummary) => ({
        frameId: summary.frameId,
        label: summary.frameName,
        materialName: summary.materialName,
        sectionName: summary.sectionName,
        axial: summary.axial,
        shearY: summary.shearY,
        shearZ: summary.shearZ,
        torsion: summary.torsion,
        momentY: summary.momentY,
        momentZ: summary.momentZ,
        maxForce: summary.maxForce,
        maxMoment: summary.maxMoment,
      }),
    );
  }, [model, computedResult]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredDisplacements = useMemo(() => {
    const rows = displacementRows.filter((row) => {
      if (supportFilter && row.support !== supportFilter) return false;
      if (
        normalizedQuery &&
        !`${row.label} ${row.nodeId}`.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
    return sortRows(rows, sorts.displacements);
  }, [displacementRows, supportFilter, normalizedQuery, sorts.displacements]);

  const filteredReactions = useMemo(() => {
    const rows = reactionRows.filter((row) => {
      if (supportFilter && row.support !== supportFilter) return false;
      if (
        normalizedQuery &&
        !`${row.label} ${row.nodeId} ${row.supportId}`
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
    return sortRows(rows, sorts.reactions);
  }, [reactionRows, supportFilter, normalizedQuery, sorts.reactions]);

  const filteredFrames = useMemo(() => {
    const rows = frameRows.filter((row) => {
      if (materialFilter) {
        const materialId = model?.frames[row.frameId]?.materialId;
        if (materialId !== materialFilter) return false;
      }
      if (sectionFilter) {
        const sectionId = model?.frames[row.frameId]?.sectionId;
        if (sectionId !== sectionFilter) return false;
      }
      if (
        normalizedQuery &&
        !`${row.label} ${row.frameId} ${row.materialName} ${row.sectionName}`
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
    return sortRows(rows, sorts.frames);
  }, [
    frameRows,
    materialFilter,
    sectionFilter,
    normalizedQuery,
    sorts.frames,
    model,
  ]);

  if (!resultsTablesOpen) return null;

  const totalRows = {
    displacements: displacementRows.length,
    reactions: reactionRows.length,
    frames: frameRows.length,
  };

  const handleSort = (key: string) => {
    setSorts((state) => {
      const current = state[tab];
      return {
        ...state,
        [tab]:
          current?.key === key
            ? { key, dir: current.dir === 1 ? -1 : 1 }
            : { key, dir: 1 },
      };
    });
  };

  const selectNodeAndClose = (nodeId: string) => {
    selectNode(nodeId);
    setResultsTablesOpen(false);
  };

  const selectFrameAndClose = (frameId: string) => {
    selectFrame(frameId);
    setResultsTablesOpen(false);
  };

  const emptyMessage =
    !computedResult
      ? "El caso activo no tiene resultados calculados."
      : "Ninguna fila coincide con los filtros.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setResultsTablesOpen(false);
      }}
    >
      <div className="panel flex h-full max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden bg-slate-950/95 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Table2 size={15} className="shrink-0 text-sky-300" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">
                Tablas de resultados
              </div>
              <div className="truncate text-[10px] text-slate-500">
                {activeCaseLabel} · {model?.meta.units.force} ·{" "}
                {model?.meta.units.length}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn h-7 w-7 shrink-0 px-0"
            onClick={() => setResultsTablesOpen(false)}
            title="Cerrar tablas (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        <div className="shrink-0 border-b border-white/10 px-3 py-2">
          <div className="seg w-full sm:w-auto">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={cn(
                  "seg-btn flex-1 whitespace-nowrap text-[10px] sm:flex-none",
                  tab === entry.id && "seg-btn-active",
                )}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                <span className="ml-1 font-mono text-[9px] opacity-60">
                  {totalRows[entry.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[170px] flex-1 sm:max-w-xs">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  tab === "frames"
                    ? "Buscar barra, material o sección…"
                    : "Buscar nudo o apoyo…"
                }
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-7 pr-2 text-[11px] text-slate-200 outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:border-sky-400/60"
              />
            </div>

            {tab === "frames" ? (
              <>
                <FilterSelect
                  label="Todos los materiales"
                  value={materialFilter}
                  onChange={setMaterialFilter}
                  options={materialOptions}
                />
                <FilterSelect
                  label="Todas las secciones"
                  value={sectionFilter}
                  onChange={setSectionFilter}
                  options={sectionOptions}
                />
              </>
            ) : (
              <FilterSelect
                label="Todos los apoyos"
                value={supportFilter}
                onChange={setSupportFilter}
                options={supportOptions}
              />
            )}

            {(query || materialFilter || sectionFilter || supportFilter) && (
              <button
                type="button"
                className="btn h-8 text-[10px]"
                onClick={() => {
                  setQuery("");
                  setMaterialFilter("");
                  setSectionFilter("");
                  setSupportFilter("");
                }}
              >
                Limpiar filtros
              </button>
            )}

            <div className="ml-auto font-mono text-[10px] text-slate-500">
              {tab === "displacements"
                ? `${filteredDisplacements.length} nudos`
                : tab === "reactions"
                  ? `${filteredReactions.length} apoyos`
                  : `${filteredFrames.length} barras`}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {tab === "displacements" && (
            <table className="w-full border-collapse text-[10px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 shadow">
                <tr>
                  <SortableHeader
                    label="Nudo"
                    sortKey="label"
                    sort={sorts.displacements}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortableHeader
                    label="Apoyo"
                    sortKey="supportLabel"
                    sort={sorts.displacements}
                    onSort={handleSort}
                    align="left"
                  />
                  {(
                    [
                      ["ux", "ux"],
                      ["uy", "uy"],
                      ["uz", "uz"],
                      ["rx", "rx"],
                      ["ry", "ry"],
                      ["rz", "rz"],
                      ["magnitude", "|u|"],
                    ] as const
                  ).map(([key, label]) => (
                    <SortableHeader
                      key={key}
                      label={label}
                      sortKey={key}
                      sort={sorts.displacements}
                      onSort={handleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {filteredDisplacements.map((row) => (
                  <tr
                    key={row.nodeId}
                    className="cursor-pointer border-t border-white/[0.05] text-slate-300 transition hover:bg-sky-400/[0.06]"
                    onClick={() => selectNodeAndClose(row.nodeId)}
                    title="Seleccionar el nudo en el visor 3D"
                  >
                    <td className="px-2 py-1 text-left text-slate-100">
                      {row.label}
                    </td>
                    <td className="px-2 py-1 text-left text-slate-500">
                      {row.supportLabel}
                    </td>
                    {(
                      ["ux", "uy", "uz", "rx", "ry", "rz", "magnitude"] as const
                    ).map((key) => (
                      <td key={key} className="px-2 py-1 text-right">
                        {formatNumber(Number(row[key]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "reactions" && (
            <table className="w-full border-collapse text-[10px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 shadow">
                <tr>
                  <SortableHeader
                    label="Apoyo"
                    sortKey="supportId"
                    sort={sorts.reactions}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortableHeader
                    label="Nudo"
                    sortKey="label"
                    sort={sorts.reactions}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortableHeader
                    label="Tipo"
                    sortKey="supportLabel"
                    sort={sorts.reactions}
                    onSort={handleSort}
                    align="left"
                  />
                  {(
                    [
                      ["fx", "Fx"],
                      ["fy", "Fy"],
                      ["fz", "Fz"],
                      ["mx", "Mx"],
                      ["my", "My"],
                      ["mz", "Mz"],
                      ["force", "|F|"],
                      ["moment", "|M|"],
                    ] as const
                  ).map(([key, label]) => (
                    <SortableHeader
                      key={key}
                      label={label}
                      sortKey={key}
                      sort={sorts.reactions}
                      onSort={handleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {filteredReactions.map((row) => (
                  <tr
                    key={row.supportId}
                    className="cursor-pointer border-t border-white/[0.05] text-slate-300 transition hover:bg-sky-400/[0.06]"
                    onClick={() => selectNodeAndClose(row.nodeId)}
                    title="Seleccionar el apoyo en el visor 3D"
                  >
                    <td className="px-2 py-1 text-left text-slate-100">
                      {row.supportId}
                    </td>
                    <td className="px-2 py-1 text-left text-slate-400">
                      {row.label}
                    </td>
                    <td className="px-2 py-1 text-left text-slate-500">
                      {row.supportLabel}
                    </td>
                    {(
                      [
                        "fx",
                        "fy",
                        "fz",
                        "mx",
                        "my",
                        "mz",
                        "force",
                        "moment",
                      ] as const
                    ).map((key) => (
                      <td key={key} className="px-2 py-1 text-right">
                        {formatNumber(Number(row[key]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "frames" && (
            <table className="w-full border-collapse text-[10px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 shadow">
                <tr>
                  <SortableHeader
                    label="Barra"
                    sortKey="label"
                    sort={sorts.frames}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortableHeader
                    label="Material"
                    sortKey="materialName"
                    sort={sorts.frames}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortableHeader
                    label="Sección"
                    sortKey="sectionName"
                    sort={sorts.frames}
                    onSort={handleSort}
                    align="left"
                  />
                  {(
                    [
                      ["axial", "|N|"],
                      ["shearY", "|Vy|"],
                      ["shearZ", "|Vz|"],
                      ["torsion", "|T|"],
                      ["momentY", "|My|"],
                      ["momentZ", "|Mz|"],
                      ["maxForce", "|F| máx"],
                      ["maxMoment", "|M| máx"],
                    ] as const
                  ).map(([key, label]) => (
                    <SortableHeader
                      key={key}
                      label={label}
                      sortKey={key}
                      sort={sorts.frames}
                      onSort={handleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {filteredFrames.map((row) => (
                  <tr
                    key={row.frameId}
                    className="cursor-pointer border-t border-white/[0.05] text-slate-300 transition hover:bg-cyan-400/[0.07]"
                    onClick={() => selectFrameAndClose(row.frameId)}
                    title="Abrir el inspector de la barra"
                  >
                    <td className="px-2 py-1 text-left text-slate-100">
                      {row.label}
                      <span className="ml-1 text-[9px] text-slate-600">
                        {row.frameId}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-left text-slate-500">
                      {row.materialName}
                    </td>
                    <td className="px-2 py-1 text-left text-slate-500">
                      {row.sectionName}
                    </td>
                    {(
                      [
                        "axial",
                        "shearY",
                        "shearZ",
                        "torsion",
                        "momentY",
                        "momentZ",
                        "maxForce",
                        "maxMoment",
                      ] as const
                    ).map((key) => (
                      <td key={key} className="px-2 py-1 text-right">
                        {formatNumber(Number(row[key]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {((tab === "displacements" && filteredDisplacements.length === 0) ||
            (tab === "reactions" && filteredReactions.length === 0) ||
            (tab === "frames" && filteredFrames.length === 0)) && (
            <div className="px-3 py-8 text-center text-[11px] text-slate-500">
              {emptyMessage}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-3 py-1.5 text-[9px] text-slate-500">
          Haz clic en una fila para inspeccionar el nudo o la barra en el visor 3D ·
          Los máximos corresponden a los valores absolutos de las estaciones
          exportadas.
        </div>
      </div>
    </div>
  );
}
