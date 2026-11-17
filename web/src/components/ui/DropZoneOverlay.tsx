import { FileJson } from "lucide-react";

export default function DropZoneOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-sky-950/60 p-6 backdrop-blur-sm">
      <div className="grid w-full max-w-xl place-items-center rounded-3xl border-2 border-dashed border-sky-400/70 bg-slate-950/70 px-8 py-12 text-center shadow-2xl">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-sky-400/40 bg-sky-400/10 text-sky-300">
          <FileJson size={30} />
        </div>
        <div className="mt-4 text-lg font-semibold text-white">
          Suelta el archivo JSON de pymas
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Se valida y renderiza localmente. Nada sale de tu navegador.
        </div>
      </div>
    </div>
  );
}
