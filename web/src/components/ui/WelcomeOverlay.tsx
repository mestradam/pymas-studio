import { FileJson, Loader2, MoveUpRight } from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import OpenFileButton from "./OpenFileButton";

const TYPE_LABELS: Record<string, string> = {
  beam: "Viga",
  bar: "Barra",
  space_frame: "Pórtico",
  space_truss: "Cercha",
};

export default function WelcomeOverlay() {
  const samples = useModelStore((state) => state.samples);
  const loadingSamples = useModelStore((state) => state.loadingSamples);
  const loadSample = useModelStore((state) => state.loadSample);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-300">
            <FileJson size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              PyMAS Studio 3D
            </h1>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              Visor estático de modelos estructurales exportados por{" "}
              <span className="font-mono text-slate-300">pymas</span>. Todo se procesa
              en tu navegador; ningún archivo se sube a un servidor.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <OpenFileButton className="h-8 border-sky-400/30 bg-sky-400/10 text-sky-100 hover:bg-sky-400/20">
            <>
              <MoveUpRight size={13} />
              Abrir JSON local
            </>
          </OpenFileButton>
          <span className="text-[11px] text-slate-500">
            o arrastra un <span className="font-mono">.json</span> sobre la ventana
          </span>
          {loadingSamples && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Leyendo ejemplos…
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <h2 className="panel-title">Modelos de ejemplo</h2>
          <span className="text-[10px] text-slate-600">
            {samples.length} disponibles
          </span>
        </div>

        <div className="mt-2 grid max-h-[46vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {samples.map((sample) => (
            <button
              key={sample.file}
              type="button"
              className="group flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left transition hover:border-sky-400/40 hover:bg-sky-400/[0.07]"
              onClick={() => void loadSample(sample)}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-slate-950/60 font-mono text-[9px] uppercase text-slate-400 group-hover:border-sky-400/30 group-hover:text-sky-300">
                {TYPE_LABELS[sample.type]?.slice(0, 3) ?? "MDL"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-slate-200 group-hover:text-white">
                  {sample.label}
                </span>
                <span className="block text-[9px] text-slate-500">
                  {TYPE_LABELS[sample.type] ?? sample.type}
                  {sample.nodes > 0
                    ? ` · ${sample.nodes} ${sample.nodes === 1 ? "nudo" : "nudos"} · ${sample.frames} ${sample.frames === 1 ? "barra" : "barras"}`
                    : ""}
                </span>
              </span>
            </button>
          ))}
          {!loadingSamples && samples.length === 0 && (
            <div className="col-span-full rounded-lg border border-white/10 px-3 py-4 text-center text-xs text-slate-500">
              No se encontraron ejemplos. Usa “Abrir JSON local”.
            </div>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
          Atajos: arrastra con el botón izquierdo para orbitar, rueda para acercar y
          botón derecho para desplazar. El modelo también puede abrirse con{" "}
          <span className="font-mono text-slate-500">?model=nombre.json</span>.
        </p>
      </div>
    </div>
  );
}
