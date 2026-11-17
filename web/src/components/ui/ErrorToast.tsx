import { AlertTriangle, X } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";

export default function ErrorToast() {
  const error = useModelStore((state) => state.error);
  const dismissError = useModelStore((state) => state.dismissError);

  if (!error) return null;

  return (
    <div className="absolute left-1/2 top-3 z-40 w-[min(92%,560px)] -translate-x-1/2">
      <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-950/90 px-3 py-2.5 text-xs text-rose-100 shadow-2xl backdrop-blur">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-300" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-rose-100">No se pudo cargar el modelo</div>
          <div className="mt-0.5 max-h-28 overflow-y-auto break-words text-[11px] leading-relaxed text-rose-200/80">
            {error}
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-rose-300 transition hover:bg-white/10 hover:text-white"
          onClick={dismissError}
          title="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
