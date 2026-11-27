import { useEffect, useRef } from "react";
import { useModelStore } from "../store/useModelStore";
import { dispatchShortcut, type ShortcutContext } from "./shortcuts";

interface Options extends ShortcutContext {
  helpOpen: boolean;
  closeHelp: () => void;
  /** Aviso breve en pantalla tras un atajo (`null` si no hay texto). */
  notify: (message: string) => void;
}

/**
 * Atajos de teclado globales. `Esc` cierra, en orden: la ayuda, las tablas,
 * el panel de comparación y por último la selección.
 */
export function useKeyboardShortcuts(options: Options): void {
  const ref = useRef(options);
  ref.current = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = ref.current;
      if (event.key === "Escape") {
        const state = useModelStore.getState();
        if (current.helpOpen) current.closeHelp();
        else if (state.resultsTablesOpen) state.setResultsTablesOpen(false);
        else if (state.comparePanelOpen) state.setComparePanelOpen(false);
        else if (state.selectedFrameId || state.selectedNodeId) state.clearSelection();
        return;
      }
      const outcome = dispatchShortcut(event, current);
      if (outcome.kind === "ignored") return;
      event.preventDefault();
      if (outcome.kind === "help") current.toggleHelp();
      else if (outcome.message) current.notify(outcome.message);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
