import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import { computeEquilibrium } from "../../engine/equilibrium";
import { formatNumber } from "../../engine/geometry";

export default function EquilibriumBar() {
  const model = useModelStore((state) => state.model);
  const activePatternId = useModelStore((state) => state.activePatternId);

  const equilibrium = useMemo(() => {
    if (!model || !activePatternId || !model.results[activePatternId]) return null;
    try {
      return computeEquilibrium(model, activePatternId);
    } catch {
      return null;
    }
  }, [model, activePatternId]);

  const forceUnit = model?.meta.units.force ?? "kN";

  return (
    <footer className="relative z-20 flex h-8 shrink-0 items-center gap-3 border-t border-white/10 bg-slate-950/90 px-3 text-[10px] text-slate-400">
      <span className="hidden items-center gap-1 font-mono text-slate-500 sm:flex">
        <span className="text-sky-400">Z↑</span> plano XY
      </span>
      <span className="hidden h-3.5 w-px bg-white/10 sm:block" />

      {!model && <span>Carga un modelo JSON para comenzar.</span>}

      {model && !activePatternId && (
        <span className="flex items-center gap-1.5">
          <MinusCircle size={12} className="text-slate-500" />
          Sin patrón de cargas activo.
        </span>
      )}

      {model && activePatternId && !equilibrium && (
        <span className="flex items-center gap-1.5 text-amber-300/90">
          <AlertTriangle size={12} />
          El modelo no incluye resultados exportados para el patrón seleccionado.
        </span>
      )}

      {equilibrium && (
        <>
          <span
            className={
              equilibrium.balanced
                ? "flex items-center gap-1.5 text-emerald-300/90"
                : "flex items-center gap-1.5 text-rose-300"
            }
          >
            {equilibrium.balanced ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertTriangle size={12} />
            )}
            {equilibrium.balanced
              ? "Equilibrio global verificado"
              : "Desequilibrio detectado"}
          </span>
          <span className="hidden font-mono text-slate-500 md:inline">
            residuo F {(equilibrium.relativeForceResidual * 100).toFixed(3)} % · M{" "}
            {(equilibrium.relativeMomentResidual * 100).toFixed(3)} %
          </span>
          <span className="ml-auto hidden font-mono text-slate-500 lg:inline">
            ΣF aplicadas {formatNumber(equilibrium.appliedForceNorm)} {forceUnit} · ΣR{" "}
            {formatNumber(equilibrium.reactionForceNorm)} {forceUnit}
          </span>
        </>
      )}

      {model && (
        <span className="ml-auto shrink-0 font-mono text-slate-600 lg:ml-0">
          {model.stats.nodes} {model.stats.nodes === 1 ? "nudo" : "nudos"} ·{" "}
          {model.stats.frames} {model.stats.frames === 1 ? "barra" : "barras"}
        </span>
      )}
    </footer>
  );
}
