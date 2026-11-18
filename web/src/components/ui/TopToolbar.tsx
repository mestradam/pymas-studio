import { Box, Loader2, Maximize2, SlidersHorizontal, Table2 } from "lucide-react";
import { useModelStore, type ViewPreset } from "../../store/useModelStore";
import { cn } from "../../lib/utils";
import OpenFileButton from "./OpenFileButton";

const VIEWS: Array<{ id: ViewPreset; label: string; title: string }> = [
  { id: "iso", label: "3D", title: "Vista isométrica" },
  { id: "plan", label: "XY", title: "Planta (XY)" },
  { id: "front", label: "XZ", title: "Elevación frontal (XZ)" },
  { id: "side", label: "YZ", title: "Elevación lateral (YZ)" },
];

interface TopToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function TopToolbar({
  sidebarOpen,
  onToggleSidebar,
}: TopToolbarProps) {
  const model = useModelStore((state) => state.model);
  const sourceLabel = useModelStore((state) => state.sourceLabel);
  const sourceFile = useModelStore((state) => state.sourceFile);
  const samples = useModelStore((state) => state.samples);
  const loadingSamples = useModelStore((state) => state.loadingSamples);
  const loadingModel = useModelStore((state) => state.loadingModel);
  const loadSample = useModelStore((state) => state.loadSample);
  const view = useModelStore((state) => state.view);
  const setView = useModelStore((state) => state.setView);
  const projection = useModelStore((state) => state.projection);
  const toggleProjection = useModelStore((state) => state.toggleProjection);
  const fitView = useModelStore((state) => state.fitView);
  const resultsTablesOpen = useModelStore((state) => state.resultsTablesOpen);
  const setResultsTablesOpen = useModelStore((state) => state.setResultsTablesOpen);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/80 px-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sky-300">
          <Box size={17} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight text-white">
            PyMAS Studio 3D
          </div>
          <div className="hidden truncate text-[10px] leading-tight text-slate-500 sm:block">
            {sourceLabel ?? "Visor estructural estático"}
          </div>
        </div>
      </div>

      <div className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />

      <div className="relative hidden min-w-[180px] max-w-[280px] flex-1 sm:block md:max-w-[330px]">
        <select
          className="h-8 w-full appearance-none rounded-lg border border-white/10 bg-white/[0.04] pl-2.5 pr-7 text-[11px] font-medium text-slate-200 outline-none transition hover:border-white/20 focus:border-sky-400/60"
          value={sourceFile ?? ""}
          disabled={loadingSamples || loadingModel}
          onChange={(event) => {
            const entry = samples.find((sample) => sample.file === event.target.value);
            if (entry) void loadSample(entry);
          }}
          title="Modelos de ejemplo"
        >
          <option value="" disabled>
            {sourceFile
              ? "Archivo local / URL"
              : model
                ? "Modelo cargado desde URL"
                : "Seleccionar ejemplo…"}
          </option>
          {samples.map((sample) => (
            <option key={sample.file} value={sample.file}>
              {sample.label}
              {sample.nodes > 0
                ? ` · ${sample.nodes} ${sample.nodes === 1 ? "nudo" : "nudos"} / ${sample.frames} ${sample.frames === 1 ? "barra" : "barras"}`
                : ""}
            </option>
          ))}
        </select>
        {loadingSamples && (
          <Loader2
            size={12}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <OpenFileButton className="h-8" />

        <div className="hidden h-8 items-center rounded-lg border border-white/10 bg-slate-950/60 p-0.5 md:flex">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "rounded-[7px] px-2 py-1 text-[11px] font-medium transition",
                view === item.id
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-slate-200",
              )}
              title={item.title}
              onClick={() => setView(item.id)}
              disabled={!model}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn h-8"
          onClick={toggleProjection}
          title="Alternar cámara perspectiva / ortográfica"
        >
          {projection === "perspective" ? "Persp." : "Orto."}
        </button>

        <button
          type="button"
          className={cn("btn h-8", resultsTablesOpen && "btn-active")}
          onClick={() => setResultsTablesOpen(!resultsTablesOpen)}
          title="Tablas de resultados"
          disabled={!model}
        >
          <Table2 size={14} />
          <span className="hidden sm:inline">Tablas</span>
        </button>

        <button
          type="button"
          className="btn h-8 px-2"
          onClick={fitView}
          title="Encuadrar el modelo"
          disabled={!model}
        >
          <Maximize2 size={14} />
        </button>

        <button
          type="button"
          className={cn("btn h-8 px-2", sidebarOpen && "btn-active")}
          onClick={onToggleSidebar}
          title="Mostrar u ocultar el panel de control"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>
    </header>
  );
}
