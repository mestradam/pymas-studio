import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Moon,
  Sun,
} from "lucide-react";
import { useModelStore } from "../../store/useModelStore";
import {
  downloadComparisonCsv,
  downloadDisplacementsCsv,
  downloadFrameForcesCsv,
  downloadReactionsCsv,
  exportScenePng,
} from "../../lib/exportScene";
import { cn } from "../../lib/utils";

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const model = useModelStore((state) => state.model);
  const computedResult = useModelStore((state) => state.computedResult);
  const comparison = useModelStore((state) => state.compareComparison);
  const compareModel = useModelStore((state) => state.compareModel);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const run = async (action: () => boolean | Promise<boolean>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn("btn h-8", open && "btn-active")}
        onClick={() => setOpen((value) => !value)}
        disabled={!model || busy}
        title="Exportar imagen PNG o tablas CSV"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} />
        <span className="hidden lg:inline">Exportar</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-50 w-64 overflow-hidden rounded-xl border border-white/10 bg-slate-950 py-1 shadow-2xl"
          role="menu"
        >
          <div className="px-3 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Imagen del lienzo
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition hover:bg-white/[0.06]"
            onClick={() => void run(() => exportScenePng({ whiteBackground: false }))}
          >
            <Moon size={14} className="mt-0.5 shrink-0 text-sky-300" />
            <span>
              <span className="block text-[11px] text-slate-200">PNG · fondo oscuro</span>
              <span className="block text-[9px] text-slate-500">
                Alta resolución (×2) con caso y escala
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition hover:bg-white/[0.06]"
            onClick={() => void run(() => exportScenePng({ whiteBackground: true }))}
          >
            <Sun size={14} className="mt-0.5 shrink-0 text-amber-300" />
            <span>
              <span className="block text-[11px] text-slate-200">PNG · fondo blanco</span>
              <span className="block text-[9px] text-slate-500">
                Ideal para informes y memorias
              </span>
            </span>
          </button>

          <div className="my-1 h-px bg-white/10" />
          <div className="px-3 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Tablas CSV
          </div>
          <MenuButton
            label="Desplazamientos nodales"
            onClick={() => run(downloadDisplacementsCsv)}
            disabled={!computedResult}
          />
          <MenuButton
            label="Reacciones en apoyos"
            onClick={() => run(downloadReactionsCsv)}
            disabled={!computedResult}
          />
          <MenuButton
            label="Esfuerzos máximos por barra"
            onClick={() => run(downloadFrameForcesCsv)}
            disabled={!computedResult}
          />
          <MenuButton
            label={
              comparison
                ? "Comparación A/B completa"
                : "Comparación A/B (sin modelo B)"
            }
            onClick={() => run(downloadComparisonCsv)}
            disabled={!comparison || !compareModel}
            highlight={Boolean(comparison)}
          />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  label,
  onClick,
  disabled,
  highlight = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      <FileSpreadsheet
        size={13}
        className={cn("shrink-0", highlight ? "text-emerald-300" : "text-slate-500")}
      />
      {label}
      {highlight && (
        <span className="ml-auto rounded bg-emerald-400/15 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-300">
          A/B
        </span>
      )}
    </button>
  );
}
