import { EyeOff } from "lucide-react";
import { isFilterActive, visibleModel } from "../../engine/visibility";
import { useModelStore } from "../../store/useModelStore";

/**
 * Aviso sobre el visor cuando hay barras ocultas, con acceso directo a
 * "Mostrar todo". Vive fuera del contenedor del canvas, así que no aparece en
 * el PNG exportado.
 */
export default function HiddenFramesBadge() {
  const model = useModelStore((state) => state.model);
  const visibility = useModelStore((state) => state.visibility);
  const upAxis = useModelStore((state) => state.upAxis);
  const showAll = useModelStore((state) => state.showAll);
  if (!model || !isFilterActive(visibility)) return null;

  const visible = visibleModel(model, visibility, upAxis).frameOrder.length;
  const hidden = model.frameOrder.length - visible;

  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/25 bg-slate-950/90 py-1 pl-2.5 pr-1 text-[11px] text-amber-100 shadow-lg backdrop-blur">
      <EyeOff size={12} className="text-amber-300" />
      <span>
        {hidden === 1 ? "1 barra oculta" : `${hidden} barras ocultas`}
        <span className="text-amber-100/50"> · {visible} visibles</span>
      </span>
      <button
        type="button"
        className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-200 transition hover:bg-amber-400/25"
        onClick={showAll}
        title="Mostrar todo (U)"
      >
        Mostrar todo
      </button>
    </div>
  );
}
