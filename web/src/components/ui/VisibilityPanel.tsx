import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { formatNumber } from "../../engine/geometry";
import {
  COORDINATE_AXES,
  FRAME_KINDS,
  FRAME_KIND_LABELS,
  classifyFrame,
  coordinateLevels,
  isFilterActive,
  visibleModel,
  type CoordinateAxis,
  type FrameKind,
} from "../../engine/visibility";
import type { PymasModel } from "../../types/pymas";
import { cn } from "../../lib/utils";

interface GroupEntry {
  id: string;
  label: string;
  count: number;
}

function groupCounts(
  model: PymasModel,
  key: "sectionId" | "materialId",
  names: Record<string, { name: string }>,
): GroupEntry[] {
  const counts = new Map<string, number>();
  for (const id of model.frameOrder) {
    const frame = model.frames[id];
    if (!frame) continue;
    counts.set(frame[key], (counts.get(frame[key]) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({
    id,
    label: names[id]?.name || id,
    count,
  }));
}

function GroupList({
  title,
  entries,
  hidden,
  onToggle,
  onSetHidden,
}: {
  title: string;
  entries: GroupEntry[];
  hidden: string[];
  onToggle: (id: string) => void;
  onSetHidden: (ids: string[]) => void;
}) {
  if (entries.length < 2) return null;
  const hiddenSet = new Set(hidden);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {title}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            className="rounded px-1 text-[9px] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            onClick={() => onSetHidden([])}
          >
            Todas
          </button>
          <button
            type="button"
            className="rounded px-1 text-[9px] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            onClick={() => onSetHidden(entries.map((entry) => entry.id))}
          >
            Ninguna
          </button>
        </span>
      </div>
      <div className="max-h-36 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
        {entries.map((entry) => (
          <label
            key={entry.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-white/[0.04]"
          >
            <input
              type="checkbox"
              checked={!hiddenSet.has(entry.id)}
              onChange={() => onToggle(entry.id)}
              className="h-3 w-3 cursor-pointer accent-sky-500"
            />
            <span className="min-w-0 flex-1 truncate" title={entry.label}>
              {entry.label}
            </span>
            <span className="font-mono text-[10px] text-slate-500">{entry.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Sección "Visibilidad" del panel de control: oculta barras por tipo, por
 * rango de coordenadas (niveles o pórticos), por sección y por material.
 */
export default function VisibilityPanel({ model }: { model: PymasModel }) {
  const visibility = useModelStore((state) => state.visibility);
  const upAxis = useModelStore((state) => state.upAxis);
  const toggleHiddenKind = useModelStore((state) => state.toggleHiddenKind);
  const toggleHiddenSection = useModelStore((state) => state.toggleHiddenSection);
  const toggleHiddenMaterial = useModelStore((state) => state.toggleHiddenMaterial);
  const setHiddenSections = useModelStore((state) => state.setHiddenSections);
  const setHiddenMaterials = useModelStore((state) => state.setHiddenMaterials);
  const setVisibilityRange = useModelStore((state) => state.setVisibilityRange);
  const showAll = useModelStore((state) => state.showAll);

  const [rangeAxis, setRangeAxis] = useState<CoordinateAxis>(
    visibility.range?.axis ?? upAxis,
  );

  const kindCounts = useMemo(() => {
    const counts: Record<FrameKind, number> = { column: 0, beam: 0, brace: 0 };
    for (const id of model.frameOrder) {
      const frame = model.frames[id];
      if (frame) counts[classifyFrame(model, frame, upAxis)] += 1;
    }
    return counts;
  }, [model, upAxis]);

  const levels = useMemo(() => coordinateLevels(model, rangeAxis), [model, rangeAxis]);
  const sections = useMemo(
    () => groupCounts(model, "sectionId", model.sections),
    [model],
  );
  const materials = useMemo(
    () => groupCounts(model, "materialId", model.materials),
    [model],
  );

  const visibleCount = visibleModel(model, visibility, upAxis).frameOrder.length;
  const total = model.frameOrder.length;
  const active = isFilterActive(visibility);
  const unit = model.meta.units.length;

  const range = visibility.range?.axis === rangeAxis ? visibility.range : null;
  const levelIndex = (value: number | undefined) => {
    if (value === undefined) return -1;
    let best = -1;
    let bestDistance = Infinity;
    levels.forEach((level, index) => {
      const distance = Math.abs(level - value);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };
  const fromIndex = range ? levelIndex(range.min) : 0;
  const toIndex = range ? levelIndex(range.max) : levels.length - 1;

  const setRange = (from: number, to: number) => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    if (lo <= 0 && hi >= levels.length - 1) {
      setVisibilityRange(null);
      return;
    }
    setVisibilityRange({ axis: rangeAxis, min: levels[lo]!, max: levels[hi]! });
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Visibilidad</h2>
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums",
            active ? "text-amber-300" : "text-slate-500",
          )}
        >
          {visibleCount} / {total} barras
        </span>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Tipo de barra
        </div>
        <div className="grid grid-cols-3 gap-1">
          {FRAME_KINDS.map((kind) => {
            const hidden = visibility.hiddenKinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                disabled={kindCounts[kind] === 0}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md border px-1 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-35",
                  hidden
                    ? "border-white/[0.06] bg-transparent text-slate-500 line-through"
                    : "border-sky-400/30 bg-sky-400/10 text-sky-100",
                )}
                onClick={() => toggleHiddenKind(kind)}
                title={hidden ? "Mostrar" : "Ocultar"}
              >
                {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                {FRAME_KIND_LABELS[kind]}
                <span className="font-mono text-[9px] opacity-70">{kindCounts[kind]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Rango por coordenada
          </span>
          {visibility.range && (
            <button
              type="button"
              className="rounded px-1 text-[9px] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              onClick={() => setVisibilityRange(null)}
            >
              Quitar
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="seg shrink-0">
            {COORDINATE_AXES.map((axis) => (
              <button
                key={axis}
                type="button"
                className={cn("seg-btn px-2", rangeAxis === axis && "seg-btn-active")}
                onClick={() => {
                  setRangeAxis(axis);
                  if (visibility.range && visibility.range.axis !== axis) {
                    setVisibilityRange(null);
                  }
                }}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </div>
          <select
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-900 px-1 py-1 font-mono text-[10px] text-slate-200"
            value={fromIndex}
            disabled={levels.length < 2}
            onChange={(event) => setRange(Number(event.target.value), toIndex)}
            aria-label="Desde"
          >
            {levels.map((level, index) => (
              <option key={index} value={index}>
                {formatNumber(level)}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-500">a</span>
          <select
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-900 px-1 py-1 font-mono text-[10px] text-slate-200"
            value={toIndex}
            disabled={levels.length < 2}
            onChange={(event) => setRange(fromIndex, Number(event.target.value))}
            aria-label="Hasta"
          >
            {levels.map((level, index) => (
              <option key={index} value={index}>
                {formatNumber(level)}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-500">{unit}</span>
        </div>
        <p className="mt-1 text-[9px] leading-snug text-slate-600">
          Con el mismo valor en ambos se ve un solo nivel o pórtico.
        </p>
      </div>

      <GroupList
        title="Secciones"
        entries={sections}
        hidden={visibility.hiddenSections}
        onToggle={toggleHiddenSection}
        onSetHidden={setHiddenSections}
      />
      <GroupList
        title="Materiales"
        entries={materials}
        hidden={visibility.hiddenMaterials}
        onToggle={toggleHiddenMaterial}
        onSetHidden={setHiddenMaterials}
      />

      <div className="flex items-center justify-between gap-2 text-[9px] text-slate-600">
        <span>
          Barra seleccionada: <kbd className="font-mono text-slate-400">H</kbd> ocultar ·{" "}
          <kbd className="font-mono text-slate-400">I</kbd> aislar ·{" "}
          <kbd className="font-mono text-slate-400">U</kbd> todo
        </span>
        <button
          type="button"
          className="btn h-6 px-2 text-[10px]"
          disabled={!active}
          onClick={showAll}
          title="Mostrar todo (U)"
        >
          Mostrar todo
        </button>
      </div>
    </section>
  );
}
