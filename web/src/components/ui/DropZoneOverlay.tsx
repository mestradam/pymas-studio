import { FileJson } from "lucide-react";

export default function DropZoneOverlay({
  active,
  count = 1,
}: {
  active: boolean;
  count?: number;
}) {
  if (!active) return null;
  const twoModels = count >= 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-sky-950/60 p-6 backdrop-blur-sm">
      <div className="grid w-full max-w-xl place-items-center rounded-3xl border-2 border-dashed border-sky-400/70 bg-slate-950/70 px-8 py-12 text-center shadow-2xl">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-sky-400/40 bg-sky-400/10 text-sky-300">
          <FileJson size={30} />
        </div>
        <div className="mt-4 text-lg font-semibold text-white">
          {twoModels
            ? "Suelta los dos modelos para comparar A/B"
            : "Suelta el archivo JSON de pymas"}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {twoModels
            ? "El primer archivo será el modelo base A y el segundo el modificado B."
            : "También puedes soltar dos JSON a la vez para abrir el comparador."}
        </div>
        <div className="mt-3 text-[10px] text-slate-500">
          Se valida y renderiza localmente. Nada sale de tu navegador.
        </div>
      </div>
    </div>
  );
}
