import { Keyboard, X } from "lucide-react";
import {
  EXTRA_HELP,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  type ShortcutGroup,
} from "../../lib/shortcuts";

interface Row {
  keys: string[];
  label: string;
}

function rowsFor(group: ShortcutGroup): Row[] {
  const rows: Row[] = [];
  for (const shortcut of SHORTCUTS) {
    if (shortcut.group !== group) continue;
    // Las cuatro vistas y el paso de casos se agrupan en una sola fila.
    const merged =
      group === "Vista" && /^[1-4]$/.test(shortcut.keyLabel)
        ? "Vistas: 3D · planta · frontal · lateral"
        : shortcut.keyLabel === "," || shortcut.keyLabel === "."
          ? "Patrón o combinación anterior / siguiente"
          : null;
    const existing = merged ? rows.find((row) => row.label === merged) : undefined;
    if (existing) existing.keys.push(shortcut.keyLabel);
    else rows.push({ keys: [shortcut.keyLabel], label: merged ?? shortcut.label });
  }
  if (group === "Visibilidad") {
    rows.find((row) => row.label === "Mostrar todo")?.keys.push("Alt+H");
  }
  for (const extra of EXTRA_HELP) {
    if (extra.group === group) rows.push({ keys: [extra.keyLabel], label: extra.label });
  }
  return rows;
}

/** Ventana de ayuda con todos los atajos, generada desde el registro. */
export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-full w-[min(680px,100%)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl"
        role="dialog"
        aria-label="Atajos de teclado"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Keyboard size={16} className="text-sky-300" />
            Atajos de teclado
          </div>
          <button type="button" className="btn h-7 w-7 px-0" onClick={onClose} title="Cerrar (Esc)">
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group}>
              <h3 className="panel-title mb-1.5">{group}</h3>
              <div className="space-y-1">
                {rowsFor(group).map((row) => (
                  <div key={row.label} className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="flex shrink-0 gap-1">
                      {row.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-[1.4rem] rounded border border-white/15 bg-white/[0.06] px-1 py-px text-center font-mono text-[10px] text-slate-100"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">{row.label}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-slate-500">
          Las teclas no actúan mientras se escribe en un campo. Funcionan con cualquier
          distribución de teclado porque se leen por su posición física.
        </p>
      </div>
    </div>
  );
}
