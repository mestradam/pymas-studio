import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import {
  computeCombinationEquilibrium,
  computeEquilibrium,
  sumResultReactions,
} from "../../engine/equilibrium";
import { formatNumber } from "../../engine/geometry";
import { viewPlaneLabel } from "../../engine/upAxis";

export default function EquilibriumBar() {
  const model = useModelStore((state) => state.model);
  const upAxis = useModelStore((state) => state.upAxis);
  const activePatternId = useModelStore((state) => state.activePatternId);
  const resultMode = useModelStore((state) => state.resultMode);
  const activeCombinationId = useModelStore((state) => state.activeCombinationId);
  const computedResult = useModelStore((state) => state.computedResult);
  const resultError = useModelStore((state) => state.resultError);
  const activeCombinationIds = useModelStore((state) => state.activeCombinationIds);

  const reactionSum = useMemo(() => {
    if (!model || !computedResult) return null;
    return sumResultReactions(model, computedResult);
  }, [model, computedResult]);

  const equilibrium = useMemo(() => {
    if (!model || !computedResult) return null;
    try {
      if (resultMode === "pattern" && activePatternId) {
        return computeEquilibrium(model, activePatternId, computedResult);
      }
      if (resultMode === "combination" && activeCombinationId) {
        const combination = model.loadCombinations[activeCombinationId];
        if (combination && combination.type !== "envelope") {
          return computeCombinationEquilibrium(model, combination);
        }
      }
    } catch {
      return null;
    }
    return null;
  }, [model, computedResult, resultMode, activePatternId, activeCombinationId]);

  const forceUnit = model?.meta.units.force ?? "kN";

  const caseLabel = useMemo(() => {
    if (!model) return null;
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
    } comb.`;
  }, [model, resultMode, activePatternId, activeCombinationId, activeCombinationIds]);

  const isEnvelope = resultMode === "env_max" || resultMode === "env_min";

  return (
    <footer className="relative z-20 flex h-8 shrink-0 items-center gap-2 overflow-hidden border-t border-white/10 bg-slate-950/90 px-3 text-[10px] text-slate-400">
      <span className="hidden items-center gap-1 font-mono text-slate-500 sm:flex">
        <span className="text-sky-400">{upAxis.toUpperCase()}↑</span> plano{" "}
        {viewPlaneLabel("plan", upAxis)}
      </span>
      <span className="hidden h-3.5 w-px bg-white/10 sm:block" />

      {!model && <span>Carga un modelo JSON para comenzar.</span>}

      {model && !computedResult && !resultError && (
        <span className="flex items-center gap-1.5">
          <MinusCircle size={12} className="text-slate-500" />
          {caseLabel}: sin resultados disponibles.
        </span>
      )}

      {model && resultError && (
        <span className="flex items-center gap-1.5 truncate text-rose-300">
          <AlertTriangle size={12} />
          {resultError}
        </span>
      )}

      {model && computedResult && (
        <>
          {equilibrium ? (
            <span
              className={
                equilibrium.balanced
                  ? "flex shrink-0 items-center gap-1.5 text-emerald-300/90"
                  : "flex shrink-0 items-center gap-1.5 text-rose-300"
              }
              title={caseLabel ?? undefined}
            >
              {equilibrium.balanced ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              {equilibrium.balanced ? "Equilibrio global" : "Desequilibrio"}
            </span>
          ) : (
            <span
              className="flex shrink-0 items-center gap-1.5 text-amber-300/80"
              title={
                isEnvelope
                  ? "Una envolvente combina extremos de casos distintos; no es un estado de equilibrio."
                  : caseLabel ?? undefined
              }
            >
              <MinusCircle size={12} />
              {isEnvelope ? "Envolvente de extremos" : caseLabel}
            </span>
          )}

          {reactionSum && (
            <span className="hidden items-center gap-2.5 font-mono text-slate-400 md:flex">
              <span>
                ΣFx{" "}
                <span className="text-slate-200">
                  {formatNumber(reactionSum.force[0])}
                </span>
              </span>
              <span>
                ΣFy{" "}
                <span className="text-slate-200">
                  {formatNumber(reactionSum.force[1])}
                </span>
              </span>
              <span>
                ΣFz{" "}
                <span className="text-slate-200">
                  {formatNumber(reactionSum.force[2])}
                </span>
              </span>
              <span className="text-slate-600">{forceUnit}</span>
            </span>
          )}

          {equilibrium && (
            <span className="hidden font-mono text-slate-500 xl:inline">
              residuo F {(equilibrium.relativeForceResidual * 100).toFixed(3)} % · M{" "}
              {(equilibrium.relativeMomentResidual * 100).toFixed(3)} %
            </span>
          )}
        </>
      )}

      {model && (
        <span className="ml-auto hidden shrink-0 truncate font-mono text-slate-600 lg:inline">
          {caseLabel} · {model.stats.nodes} nudos · {model.stats.frames} barras
        </span>
      )}
    </footer>
  );
}
