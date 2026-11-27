/**
 * Atajos de teclado de una sola tecla.
 *
 * Un único registro alimenta el manejador de teclado (`useKeyboardShortcuts`)
 * y la ayuda (`ShortcutHelp`), para que nunca se desincronicen. Las teclas se
 * identifican por `event.code` (tecla física), de modo que funcionan igual con
 * distribución española, latinoamericana o inglesa.
 */

import { useModelStore, type ViewPreset } from "../store/useModelStore";

export type ShortcutGroup =
  | "Vista"
  | "Geometría"
  | "Resultados"
  | "Capas"
  | "Visibilidad"
  | "Paneles";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Vista",
  "Geometría",
  "Resultados",
  "Capas",
  "Visibilidad",
  "Paneles",
];

/** Acciones que viven fuera del store (estado local de `App`). */
export interface ShortcutContext {
  /** Abre o cierra el panel de control; devuelve el nuevo estado. */
  toggleSidebar: () => boolean;
  toggleHelp: () => void;
}

export interface Shortcut {
  /** Valores de `event.code` que disparan el atajo. */
  codes: string[];
  /** Tecla tal como se muestra en la ayuda. */
  keyLabel: string;
  group: ShortcutGroup;
  label: string;
  /** Ejecuta la acción; devuelve el texto del aviso o `null`. */
  run: (context: ShortcutContext) => string | null;
}

const onOff = (label: string, value: boolean) => `${label} · ${value ? "visible" : "oculto"}`;

function toggleFlag(
  label: string,
  read: (state: ReturnType<typeof useModelStore.getState>) => boolean,
  write: (state: ReturnType<typeof useModelStore.getState>, value: boolean) => void,
): Shortcut["run"] {
  return () => {
    const state = useModelStore.getState();
    if (!state.model) return null;
    const value = !read(state);
    write(state, value);
    return onOff(label, value);
  };
}

function viewShortcut(code: string, numpad: string, key: string, view: ViewPreset, label: string): Shortcut {
  return {
    codes: [code, numpad],
    keyLabel: key,
    group: "Vista",
    label,
    run: () => {
      const state = useModelStore.getState();
      if (!state.model) return null;
      state.setView(view);
      return null;
    },
  };
}

/** Patrón o combinación anterior/siguiente según el modo de resultados. */
function stepCase(step: 1 | -1): string | null {
  const state = useModelStore.getState();
  const model = state.model;
  if (!model) return null;
  const cycle = (order: string[], current: string | null) => {
    if (order.length === 0) return null;
    const index = current ? order.indexOf(current) : -1;
    return order[(index + step + order.length) % order.length] ?? null;
  };
  if (state.resultMode === "pattern") {
    const next = cycle(model.loadPatternOrder, state.activePatternId);
    if (!next) return null;
    state.setActivePattern(next);
    return `Patrón · ${model.loadPatterns[next]?.name ?? next}`;
  }
  if (state.resultMode === "combination") {
    const next = cycle(model.loadCombinationOrder, state.activeCombinationId);
    if (!next) return null;
    state.setActiveCombination(next);
    return `Combinación · ${model.loadCombinations[next]?.name ?? next}`;
  }
  return null;
}

export const SHORTCUTS: Shortcut[] = [
  // Vista
  {
    codes: ["KeyF"],
    keyLabel: "F",
    group: "Vista",
    label: "Encuadrar todo",
    run: () => {
      const state = useModelStore.getState();
      if (!state.model) return null;
      state.fitView();
      return null;
    },
  },
  viewShortcut("Digit1", "Numpad1", "1", "iso", "Vista 3D isométrica"),
  viewShortcut("Digit2", "Numpad2", "2", "plan", "Planta"),
  viewShortcut("Digit3", "Numpad3", "3", "front", "Elevación frontal"),
  viewShortcut("Digit4", "Numpad4", "4", "side", "Elevación lateral"),
  {
    codes: ["KeyP"],
    keyLabel: "P",
    group: "Vista",
    label: "Perspectiva ↔ ortográfica",
    run: () => {
      const state = useModelStore.getState();
      state.toggleProjection();
      return useModelStore.getState().projection === "perspective"
        ? "Cámara perspectiva"
        : "Cámara ortográfica";
    },
  },

  // Geometría
  {
    codes: ["KeyE"],
    keyLabel: "E",
    group: "Geometría",
    label: "Extruido ↔ alambre",
    run: () => {
      const state = useModelStore.getState();
      if (!state.model) return null;
      const next = state.renderMode === "extruded" ? "wire" : "extruded";
      state.setRenderMode(next);
      return next === "extruded" ? "Geometría · extruida" : "Geometría · alambre";
    },
  },

  // Resultados
  {
    codes: ["KeyD"],
    keyLabel: "D",
    group: "Resultados",
    label: "Deformada",
    run: toggleFlag("Deformada", (s) => s.showDeformed, (s, v) => s.setShowDeformed(v)),
  },
  {
    codes: ["KeyX"],
    keyLabel: "X",
    group: "Resultados",
    label: "Deformada en línea ↔ secciones extruidas",
    run: () => {
      const state = useModelStore.getState();
      if (!state.model) return null;
      const next = state.deformedRenderMode === "extruded" ? "line" : "extruded";
      state.setDeformedRenderMode(next);
      if (!state.showDeformed) state.setShowDeformed(true);
      return next === "extruded" ? "Deformada · secciones extruidas" : "Deformada · línea";
    },
  },
  {
    codes: ["KeyA"],
    keyLabel: "A",
    group: "Resultados",
    label: "Animación armónica",
    run: () => {
      const state = useModelStore.getState();
      if (!state.model) return null;
      const value = !state.animateDeformation;
      state.setAnimateDeformation(value);
      return `Animación · ${value ? "activa" : "detenida"}`;
    },
  },
  {
    codes: ["KeyM"],
    keyLabel: "M",
    group: "Resultados",
    label: "Diagramas de acciones internas",
    run: toggleFlag(
      "Diagramas",
      (s) => s.showForceDiagrams,
      (s, v) => s.setShowForceDiagrams(v),
    ),
  },
  {
    codes: ["Comma"],
    keyLabel: ",",
    group: "Resultados",
    label: "Patrón o combinación anterior",
    run: () => stepCase(-1),
  },
  {
    codes: ["Period"],
    keyLabel: ".",
    group: "Resultados",
    label: "Patrón o combinación siguiente",
    run: () => stepCase(1),
  },

  // Capas
  {
    codes: ["KeyN"],
    keyLabel: "N",
    group: "Capas",
    label: "Nudos",
    run: toggleFlag("Nudos", (s) => s.showNodes, (s, v) => s.setShowNodes(v)),
  },
  {
    codes: ["KeyC"],
    keyLabel: "C",
    group: "Capas",
    label: "Etiquetas de nudos",
    run: toggleFlag("Etiquetas de nudos", (s) => s.showLabels, (s, v) => s.setShowLabels(v)),
  },
  {
    codes: ["KeyS"],
    keyLabel: "S",
    group: "Capas",
    label: "Apoyos",
    run: toggleFlag("Apoyos", (s) => s.showSupports, (s, v) => s.setShowSupports(v)),
  },
  {
    codes: ["KeyJ"],
    keyLabel: "J",
    group: "Capas",
    label: "Rótulas / liberaciones",
    run: toggleFlag("Rótulas", (s) => s.showReleases, (s, v) => s.setShowReleases(v)),
  },
  {
    codes: ["KeyL"],
    keyLabel: "L",
    group: "Capas",
    label: "Vectores de carga",
    run: toggleFlag("Cargas", (s) => s.showLoads, (s, v) => s.setShowLoads(v)),
  },
  {
    codes: ["KeyR"],
    keyLabel: "R",
    group: "Capas",
    label: "Reacciones en apoyos",
    run: toggleFlag("Reacciones", (s) => s.showReactions, (s, v) => s.setShowReactions(v)),
  },
  {
    codes: ["KeyG"],
    keyLabel: "G",
    group: "Capas",
    label: "Grilla",
    run: toggleFlag("Grilla", (s) => s.showGrid, (s, v) => s.setShowGrid(v)),
  },

  // Visibilidad
  {
    codes: ["KeyH"],
    keyLabel: "H",
    group: "Visibilidad",
    label: "Ocultar la selección",
    run: () => {
      const state = useModelStore.getState();
      if (!state.selectedFrameId && !state.selectedNodeId) return null;
      state.hideSelection();
      return null;
    },
  },
  {
    codes: ["KeyI"],
    keyLabel: "I",
    group: "Visibilidad",
    label: "Aislar la selección",
    run: () => {
      const state = useModelStore.getState();
      if (!state.selectedFrameId && !state.selectedNodeId) return null;
      state.isolateSelection();
      return null;
    },
  },
  {
    codes: ["KeyU"],
    keyLabel: "U",
    group: "Visibilidad",
    label: "Mostrar todo",
    run: () => {
      useModelStore.getState().showAll();
      return null;
    },
  },

  // Paneles
  {
    codes: ["KeyB"],
    keyLabel: "B",
    group: "Paneles",
    label: "Panel de control",
    run: (context) => {
      context.toggleSidebar();
      return null;
    },
  },
  {
    codes: ["KeyT"],
    keyLabel: "T",
    group: "Paneles",
    label: "Tablas de resultados",
    run: () => {
      const state = useModelStore.getState();
      if (!state.model) return null;
      state.setResultsTablesOpen(!state.resultsTablesOpen);
      return null;
    },
  },
];

/** Atajos que se muestran en la ayuda pero no pasan por `SHORTCUTS`. */
export const EXTRA_HELP: Array<{ keyLabel: string; group: ShortcutGroup; label: string }> = [
  { keyLabel: "Esc", group: "Paneles", label: "Cerrar panel o deseleccionar" },
  { keyLabel: "?", group: "Paneles", label: "Esta ayuda" },
];

const BY_CODE = new Map<string, Shortcut>(
  SHORTCUTS.flatMap((shortcut) => shortcut.codes.map((code) => [code, shortcut] as const)),
);

/** Subconjunto de `KeyboardEvent` que usa el despachador (facilita los tests). */
export interface ShortcutKeyEvent {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}

/** `true` si el foco está en un campo donde las letras deben escribirse. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, [contenteditable='true']"));
}

export type ShortcutOutcome =
  | { kind: "ignored" }
  | { kind: "help" }
  | { kind: "handled"; message: string | null };

/**
 * Resuelve y ejecuta el atajo de un evento de teclado. Ignora las teclas con
 * Ctrl, Meta o Alt (salvo el alias Alt+H = mostrar todo), las repeticiones y
 * las pulsaciones dentro de campos de texto.
 */
export function dispatchShortcut(
  event: ShortcutKeyEvent,
  context: ShortcutContext,
): ShortcutOutcome {
  if (event.ctrlKey || event.metaKey || event.repeat) return { kind: "ignored" };
  if (isTypingTarget(event.target)) return { kind: "ignored" };
  if (event.altKey) {
    if (event.code !== "KeyH") return { kind: "ignored" };
    useModelStore.getState().showAll();
    return { kind: "handled", message: null };
  }
  if (event.key === "?") return { kind: "help" };
  const shortcut = BY_CODE.get(event.code);
  if (!shortcut) return { kind: "ignored" };
  return { kind: "handled", message: shortcut.run(context) };
}

/** Tecla de un atajo por su etiqueta de acción, para los tooltips. */
export function shortcutKey(label: string): string | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.label === label)?.keyLabel;
}
