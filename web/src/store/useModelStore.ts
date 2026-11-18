import { create } from "zustand";
import type {
  EnvelopeResult,
  PatternResultData,
  PymasModel,
  SampleEntry,
  SampleManifest,
} from "../types/pymas";
import { parsePymasJson, PymasParseError } from "../engine/parser";
import { assetUrl } from "../lib/assets";
import type { ColorMode } from "../engine/colors";
import type { ForceComponent } from "../engine/diagrams";
import type { HeatmapMode } from "../engine/heatmap";
import {
  combineLoadCombination,
  envelopeAcrossCombinations,
} from "../engine/superposition";
import { compareModels, type ModelComparison } from "../engine/comparison";

export type RenderMode = "wire" | "extruded";
export type ViewPreset = "iso" | "plan" | "front" | "side";
export type ProjectionMode = "perspective" | "orthographic";
export type ResultMode = "pattern" | "combination" | "env_max" | "env_min";
export type CompareView = "overlay" | "split";

const FALLBACK_SAMPLES: SampleEntry[] = [
  ["simple_beam.json", "Viga simplemente apoyada", "beam"],
  ["simple_bar.json", "Barra axial", "bar"],
  ["fixed_beam.json", "Viga biempotrada", "beam"],
  ["propped_beam.json", "Viga apoyada-apuntalada", "beam"],
  ["cantilever_beam.json", "Viga en voladizo", "beam"],
  ["continuous_beam.json", "Viga continua", "beam"],
  ["overhanging_beam.json", "Viga con voladizos", "beam"],
  ["space_frame.json", "Pórtico espacial", "space_frame"],
  ["space_truss.json", "Cercha espacial", "space_truss"],
  ["space_truss_nodal_load.json", "Cercha espacial con carga nodal", "space_truss"],
  ["F3_analisis_reparacion.json", "Fase 3 · Análisis y reparación", "space_frame"],
  ["eiffel_tower.json", "Torre Eiffel (cercha espacial)", "space_truss"],
].map(([file, label, type]) => ({
  file: file ?? "modelo.json",
  label: label ?? file ?? "Modelo",
  name: (file ?? "modelo").replace(/\.json$/i, ""),
  type: type ?? "space_frame",
  nodes: 0,
  frames: 0,
  supports: 0,
  patterns: 0,
  combinations: 0,
  sizeBytes: 0,
}));

function defaultColorMode(model: PymasModel): ColorMode {
  if (Object.keys(model.materials).length > 1) return "material";
  if (Object.keys(model.sections).length > 1) return "section";
  return "uniform";
}

function defaultView(model: PymasModel): ViewPreset {
  return /beam|bar/i.test(model.meta.type) ? "plan" : "iso";
}

function errorMessage(error: unknown): string {
  if (error instanceof PymasParseError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function assertJsonResponse(contentType: string | null, url: string): void {
  if (contentType && /text\/html/i.test(contentType)) {
    throw new Error(
      `La URL no devolvió JSON (${url}). Verifica la ruta del modelo; el servidor respondió con una página HTML (posible 404).`,
    );
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

interface DerivedResults {
  result: PatternResultData | null;
  envelope: EnvelopeResult | null;
  error: string | null;
}

interface DerivedCompareResult {
  result: PatternResultData | null;
  caseLabel: string | null;
  error: string | null;
}

/**
 * Resuelve el caso activo en el cliente:
 *  - `pattern`: resultado base exportado del patrón.
 *  - `combination`: superposición lineal calculada al vuelo.
 *  - `env_max`/`env_min`: envolvente de las combinaciones activas, también
 *    calculada al vuelo desde los patrones.
 */
function deriveResults(
  model: PymasModel | null,
  mode: ResultMode,
  patternId: string | null,
  combinationId: string | null,
  combinationIds: readonly string[],
): DerivedResults {
  if (!model) return { result: null, envelope: null, error: null };

  try {
    if (mode === "pattern") {
      const result = patternId ? model.results[patternId] ?? null : null;
      return { result, envelope: null, error: null };
    }

    if (mode === "combination") {
      const combination = combinationId ? model.loadCombinations[combinationId] : undefined;
      if (!combination) return { result: null, envelope: null, error: null };
      const computed = combineLoadCombination(model, combination);
      if ("min" in computed) {
        return { result: computed.max, envelope: computed, error: null };
      }
      return { result: computed, envelope: null, error: null };
    }

    const envelope = envelopeAcrossCombinations(model, combinationIds);
    return {
      result: mode === "env_max" ? envelope.max : envelope.min,
      envelope,
      error: null,
    };
  } catch (error) {
    return { result: null, envelope: null, error: errorMessage(error) };
  }
}

/**
 * Resuelve el caso activo en el modelo B. Si el patrón o la combinación
 * seleccionados no existen en B se usa el primero disponible; así el
 * comparador sigue funcionando con exportadores que renombran casos.
 */
function deriveCompareResult(
  model: PymasModel | null,
  mode: ResultMode,
  patternId: string | null,
  combinationId: string | null,
  combinationIds: readonly string[],
): DerivedCompareResult {
  if (!model) return { result: null, caseLabel: null, error: null };

  try {
    if (mode === "pattern") {
      const id =
        patternId && model.results[patternId]
          ? patternId
          : model.resultOrder[0] ?? null;
      if (!id) return { result: null, caseLabel: null, error: null };
      return {
        result: model.results[id] ?? null,
        caseLabel: model.loadPatterns[id]?.name ?? id,
        error: null,
      };
    }

    if (mode === "combination") {
      const id =
        combinationId && model.loadCombinations[combinationId]
          ? combinationId
          : model.loadCombinationOrder[0] ?? null;
      const combination = id ? model.loadCombinations[id] : undefined;
      if (!id || !combination) {
        return { result: null, caseLabel: null, error: null };
      }
      const computed = combineLoadCombination(model, combination);
      return {
        result: "min" in computed ? computed.max : computed,
        caseLabel: combination.name || id,
        error: null,
      };
    }

    const ids = combinationIds.filter((id) => model.loadCombinations[id]);
    const effective = ids.length > 0 ? ids : model.loadCombinationOrder;
    if (effective.length === 0) {
      return { result: null, caseLabel: null, error: null };
    }
    const envelope = envelopeAcrossCombinations(model, effective);
    return {
      result: mode === "env_max" ? envelope.max : envelope.min,
      caseLabel: `${mode === "env_max" ? "ENV MAX" : "ENV MIN"} · ${
        effective.length
      }/${model.loadCombinationOrder.length}`,
      error: null,
    };
  } catch (error) {
    return { result: null, caseLabel: null, error: errorMessage(error) };
  }
}

export interface ModelState {
  model: PymasModel | null;
  sourceLabel: string | null;
  sourceFile: string | null;
  loadingModel: boolean;
  error: string | null;

  samples: SampleEntry[];
  samplesError: string | null;
  loadingSamples: boolean;

  activePatternId: string | null;
  resultMode: ResultMode;
  activeCombinationId: string | null;
  activeCombinationIds: string[];
  computedResult: PatternResultData | null;
  envelope: EnvelopeResult | null;
  resultError: string | null;

  showDeformed: boolean;
  /** Multiplicador sobre la escala automática de la deformada. */
  deformationScale: number;
  showGhost: boolean;
  animateDeformation: boolean;
  heatmapMode: HeatmapMode;

  showForceDiagrams: boolean;
  diagramComponents: ForceComponent[];
  /** Multiplicador sobre la escala automática de los diagramas. */
  diagramScale: number;
  showDiagramLabels: boolean;
  showReactions: boolean;

  renderMode: RenderMode;
  colorMode: ColorMode;
  opacity: number;
  sectionScale: number;
  loadScale: number;

  showNodes: boolean;
  showLabels: boolean;
  showSupports: boolean;
  showReleases: boolean;
  showLoads: boolean;
  showGrid: boolean;

  /** Barra seleccionada en el visor (raycasting). */
  selectedFrameId: string | null;
  /** Nudo seleccionado en el visor (raycasting). */
  selectedNodeId: string | null;
  /** Estación normalizada 0..1 del cursor de los gráficos del inspector. */
  chartStation: number | null;
  resultsTablesOpen: boolean;

  view: ViewPreset;
  projection: ProjectionMode;
  fitToken: number;
  viewToken: number;

  /** Comparador A/B (fase 4). */
  compareEnabled: boolean;
  compareModel: PymasModel | null;
  compareSourceLabel: string | null;
  compareSourceFile: string | null;
  compareLoading: boolean;
  compareError: string | null;
  compareResult: PatternResultData | null;
  compareCaseLabel: string | null;
  compareResultError: string | null;
  compareComparison: ModelComparison | null;
  compareView: CompareView;
  compareHeatmap: boolean;
  comparePanelOpen: boolean;
}

export interface ModelActions {
  loadSamples: () => Promise<void>;
  loadFromUrl: (url: string, label?: string, sourceFile?: string | null) => Promise<void>;
  loadSample: (entry: SampleEntry) => Promise<void>;
  loadFromFile: (file: File) => Promise<void>;
  loadText: (text: string, label: string, sourceFile?: string | null) => Promise<void>;
  dismissError: () => void;
  setActivePattern: (patternId: string | null) => void;
  setResultMode: (mode: ResultMode) => void;
  setActiveCombination: (combinationId: string | null) => void;
  toggleCombination: (combinationId: string) => void;
  setActiveCombinations: (combinationIds: string[]) => void;
  setDeformationScale: (value: number) => void;
  setShowDeformed: (value: boolean) => void;
  setShowGhost: (value: boolean) => void;
  setAnimateDeformation: (value: boolean) => void;
  setHeatmapMode: (mode: HeatmapMode) => void;
  setShowForceDiagrams: (value: boolean) => void;
  toggleDiagramComponent: (component: ForceComponent) => void;
  setDiagramScale: (value: number) => void;
  setShowDiagramLabels: (value: boolean) => void;
  setShowReactions: (value: boolean) => void;
  setRenderMode: (mode: RenderMode) => void;
  setColorMode: (mode: ColorMode) => void;
  setOpacity: (value: number) => void;
  setSectionScale: (value: number) => void;
  setLoadScale: (value: number) => void;
  setShowNodes: (value: boolean) => void;
  setShowLabels: (value: boolean) => void;
  setShowSupports: (value: boolean) => void;
  setShowReleases: (value: boolean) => void;
  setShowLoads: (value: boolean) => void;
  setShowGrid: (value: boolean) => void;
  selectFrame: (frameId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  clearSelection: () => void;
  setChartStation: (station: number | null) => void;
  setResultsTablesOpen: (open: boolean) => void;
  setView: (view: ViewPreset) => void;
  setProjection: (projection: ProjectionMode) => void;
  toggleProjection: () => void;
  fitView: () => void;

  setCompareEnabled: (enabled: boolean) => void;
  setCompareView: (view: CompareView) => void;
  setCompareHeatmap: (enabled: boolean) => void;
  setComparePanelOpen: (open: boolean) => void;
  loadCompareFromFile: (file: File) => Promise<void>;
  loadCompareSample: (entry: SampleEntry) => Promise<void>;
  loadCompareText: (
    text: string,
    label: string,
    sourceFile?: string | null,
  ) => Promise<void>;
  clearCompare: () => void;
}

export type ModelStore = ModelState & ModelActions;

const INITIAL_STATE: ModelState = {
  model: null,
  sourceLabel: null,
  sourceFile: null,
  loadingModel: false,
  error: null,

  samples: [],
  samplesError: null,
  loadingSamples: false,

  activePatternId: null,
  resultMode: "pattern",
  activeCombinationId: null,
  activeCombinationIds: [],
  computedResult: null,
  envelope: null,
  resultError: null,

  showDeformed: true,
  deformationScale: 1,
  showGhost: true,
  animateDeformation: true,
  heatmapMode: "magnitude",

  showForceDiagrams: false,
  diagramComponents: ["mz"],
  diagramScale: 1,
  showDiagramLabels: true,
  showReactions: true,

  renderMode: "extruded",
  colorMode: "material",
  opacity: 0.94,
  sectionScale: 1,
  loadScale: 1,

  showNodes: true,
  showLabels: false,
  showSupports: true,
  showReleases: true,
  showLoads: true,
  showGrid: true,

  selectedFrameId: null,
  selectedNodeId: null,
  chartStation: null,
  resultsTablesOpen: false,

  view: "iso",
  projection: "perspective",
  fitToken: 0,
  viewToken: 0,

  compareEnabled: false,
  compareModel: null,
  compareSourceLabel: null,
  compareSourceFile: null,
  compareLoading: false,
  compareError: null,
  compareResult: null,
  compareCaseLabel: null,
  compareResultError: null,
  compareComparison: null,
  compareView: "overlay",
  compareHeatmap: true,
  comparePanelOpen: false,
};

export const useModelStore = create<ModelStore>((set) => {
  const applyParsedModel = (
    model: PymasModel,
    label: string,
    sourceFile: string | null,
  ): void => {
    set((state) => {
      const activePatternId =
        model.loadPatternOrder[0] ?? model.resultOrder[0] ?? null;
      const activeCombinationIds = [...model.loadCombinationOrder];
      const activeCombinationId = model.loadCombinationOrder[0] ?? null;
      const derived = deriveResults(
        model,
        "pattern",
        activePatternId,
        activeCombinationId,
        activeCombinationIds,
      );
      return {
        model,
        sourceLabel: label,
        sourceFile,
        activePatternId,
        resultMode: "pattern" as ResultMode,
        activeCombinationId,
        activeCombinationIds,
        computedResult: derived.result,
        envelope: derived.envelope,
        resultError: derived.error,
        colorMode: defaultColorMode(model),
        view: defaultView(model),
        selectedFrameId: null,
        selectedNodeId: null,
        chartStation: null,
        resultsTablesOpen: false,
        compareEnabled: false,
        compareModel: null,
        compareSourceLabel: null,
        compareSourceFile: null,
        compareLoading: false,
        compareError: null,
        compareResult: null,
        compareCaseLabel: null,
        compareResultError: null,
        compareComparison: null,
        comparePanelOpen: false,
        fitToken: state.fitToken + 1,
        viewToken: state.viewToken + 1,
        loadingModel: false,
        error: null,
      };
    });
  };

  const deriveState = (
    state: ModelState,
    mode: ResultMode,
    patternId: string | null,
    combinationId: string | null,
    combinationIds: readonly string[],
  ): Partial<ModelState> => {
    const derived = deriveResults(
      state.model,
      mode,
      patternId,
      combinationId,
      combinationIds,
    );
    const compare = deriveCompareResult(
      state.compareModel,
      mode,
      patternId,
      combinationId,
      combinationIds,
    );
    const comparison =
      state.model && state.compareModel && derived.result && compare.result
        ? compareModels(
            state.model,
            derived.result,
            state.compareModel,
            compare.result,
          )
        : null;
    return {
      computedResult: derived.result,
      envelope: derived.envelope,
      resultError: derived.error,
      compareResult: compare.result,
      compareCaseLabel: compare.caseLabel,
      compareResultError: compare.error,
      compareComparison: comparison,
    };
  };

  const applyCompareModel = (
    compareModel: PymasModel,
    label: string,
    sourceFile: string | null,
  ): void => {
    set((state) => {
      const compare = deriveCompareResult(
        compareModel,
        state.resultMode,
        state.activePatternId,
        state.activeCombinationId,
        state.activeCombinationIds,
      );
      const comparison =
        state.model && state.computedResult && compare.result
          ? compareModels(
              state.model,
              state.computedResult,
              compareModel,
              compare.result,
            )
          : null;
      return {
        compareModel,
        compareSourceLabel: label,
        compareSourceFile: sourceFile,
        compareLoading: false,
        compareError: null,
        compareEnabled: true,
        comparePanelOpen: true,
        compareResult: compare.result,
        compareCaseLabel: compare.caseLabel,
        compareResultError: compare.error,
        compareComparison: comparison,
        fitToken: state.fitToken + 1,
      };
    });
  };

  return {
    ...INITIAL_STATE,

    loadSamples: async () => {
      set({ loadingSamples: true, samplesError: null });
      try {
        const response = await fetch(assetUrl("samples/manifest.json"), {
          cache: "no-cache",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = (await response.json()) as SampleManifest;
        if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
          throw new Error("El manifiesto de ejemplos está vacío.");
        }
        set({
          samples: manifest.samples,
          loadingSamples: false,
          samplesError: null,
        });
      } catch (error) {
        set({
          samples: FALLBACK_SAMPLES,
          loadingSamples: false,
          samplesError: `No se pudo leer samples/manifest.json (${errorMessage(error)}). Se muestran nombres conocidos.`,
        });
      }
    },

    loadFromUrl: async (url, label, sourceFile = null) => {
      set({ loadingModel: true, error: null, sourceFile });
      await tick();
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error(`No se pudo descargar el modelo (HTTP ${response.status}).`);
        }
        assertJsonResponse(response.headers.get("content-type"), url);
        const text = await response.text();
        const parsed = parsePymasJson(text, label ?? url);
        applyParsedModel(parsed, label ?? url, sourceFile);
      } catch (error) {
        set({
          loadingModel: false,
          sourceFile: null,
          error: errorMessage(error),
        });
      }
    },

    loadSample: async (entry) => {
      set({ loadingModel: true, error: null, sourceFile: entry.file });
      await tick();
      try {
        const response = await fetch(assetUrl(`samples/${entry.file}`), {
          cache: "no-cache",
        });
        if (!response.ok) {
          throw new Error(`No se pudo cargar el ejemplo (HTTP ${response.status}).`);
        }
        assertJsonResponse(
          response.headers.get("content-type"),
          assetUrl(`samples/${entry.file}`),
        );
        const text = await response.text();
        const parsed = parsePymasJson(text, entry.label);
        applyParsedModel(parsed, entry.label, entry.file);
      } catch (error) {
        set({
          loadingModel: false,
          sourceFile: null,
          error: errorMessage(error),
        });
      }
    },

    loadFromFile: async (file) => {
      set({ loadingModel: true, error: null, sourceFile: null });
      await tick();
      try {
        const text = await file.text();
        const parsed = parsePymasJson(text, file.name);
        applyParsedModel(parsed, file.name, null);
      } catch (error) {
        set({
          loadingModel: false,
          error: errorMessage(error),
        });
      }
    },

    loadText: async (text, label, sourceFile = null) => {
      set({ loadingModel: true, error: null, sourceFile });
      await tick();
      try {
        const parsed = parsePymasJson(text, label);
        applyParsedModel(parsed, label, sourceFile);
      } catch (error) {
        set({
          loadingModel: false,
          error: errorMessage(error),
        });
      }
    },

    loadCompareFromFile: async (file) => {
      set({ compareLoading: true, compareError: null });
      await tick();
      try {
        const text = await file.text();
        const parsed = parsePymasJson(text, file.name);
        applyCompareModel(parsed, file.name, null);
      } catch (error) {
        set({
          compareLoading: false,
          compareError: errorMessage(error),
          comparePanelOpen: true,
        });
      }
    },

    loadCompareSample: async (entry) => {
      set({ compareLoading: true, compareError: null });
      await tick();
      try {
        const url = assetUrl(`samples/${entry.file}`);
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error(
            `No se pudo cargar el ejemplo para comparar (HTTP ${response.status}).`,
          );
        }
        assertJsonResponse(response.headers.get("content-type"), url);
        const text = await response.text();
        const parsed = parsePymasJson(text, entry.label);
        applyCompareModel(parsed, entry.label, entry.file);
      } catch (error) {
        set({
          compareLoading: false,
          compareError: errorMessage(error),
          comparePanelOpen: true,
        });
      }
    },

    loadCompareText: async (text, label, sourceFile = null) => {
      set({ compareLoading: true, compareError: null });
      await tick();
      try {
        const parsed = parsePymasJson(text, label);
        applyCompareModel(parsed, label, sourceFile);
      } catch (error) {
        set({
          compareLoading: false,
          compareError: errorMessage(error),
          comparePanelOpen: true,
        });
      }
    },

    clearCompare: () =>
      set({
        compareEnabled: false,
        compareModel: null,
        compareSourceLabel: null,
        compareSourceFile: null,
        compareLoading: false,
        compareError: null,
        compareResult: null,
        compareCaseLabel: null,
        compareResultError: null,
        compareComparison: null,
        comparePanelOpen: false,
      }),

    dismissError: () => set({ error: null }),

    setActivePattern: (patternId) => {
      set((state) => {
        if (patternId !== null && !state.model?.loadPatterns[patternId]) return state;
        return {
          activePatternId: patternId,
          resultMode: "pattern",
          ...deriveState(
            state,
            "pattern",
            patternId,
            state.activeCombinationId,
            state.activeCombinationIds,
          ),
        };
      });
    },

    setResultMode: (resultMode) => {
      set((state) => ({
        resultMode,
        ...deriveState(
          state,
          resultMode,
          state.activePatternId,
          state.activeCombinationId,
          state.activeCombinationIds,
        ),
      }));
    },

    setActiveCombination: (combinationId) => {
      set((state) => {
        if (combinationId !== null && !state.model?.loadCombinations[combinationId]) {
          return state;
        }
        return {
          activeCombinationId: combinationId,
          resultMode: "combination",
          ...deriveState(
            state,
            "combination",
            state.activePatternId,
            combinationId,
            state.activeCombinationIds,
          ),
        };
      });
    },

    toggleCombination: (combinationId) => {
      set((state) => {
        if (!state.model?.loadCombinations[combinationId]) return state;
        const active = state.activeCombinationIds.includes(combinationId)
          ? state.activeCombinationIds.filter((id) => id !== combinationId)
          : [...state.activeCombinationIds, combinationId];
        const mode =
          state.resultMode === "env_max" || state.resultMode === "env_min"
            ? state.resultMode
            : "env_max";
        return {
          activeCombinationIds: active,
          resultMode: mode,
          ...deriveState(
            state,
            mode,
            state.activePatternId,
            state.activeCombinationId,
            active,
          ),
        };
      });
    },

    setActiveCombinations: (combinationIds) => {
      set((state) => {
        const valid = combinationIds.filter((id) => Boolean(state.model?.loadCombinations[id]));
        const mode =
          state.resultMode === "env_max" || state.resultMode === "env_min"
            ? state.resultMode
            : "env_max";
        return {
          activeCombinationIds: valid,
          resultMode: mode,
          ...deriveState(
            state,
            mode,
            state.activePatternId,
            state.activeCombinationId,
            valid,
          ),
        };
      });
    },

    setDeformationScale: (deformationScale) =>
      set({ deformationScale: Math.min(10, Math.max(0.05, deformationScale)) }),
    setShowDeformed: (showDeformed) => set({ showDeformed }),
    setShowGhost: (showGhost) => set({ showGhost }),
    setAnimateDeformation: (animateDeformation) => set({ animateDeformation }),
    setHeatmapMode: (heatmapMode) => set({ heatmapMode }),
    setShowForceDiagrams: (showForceDiagrams) => set({ showForceDiagrams }),
    toggleDiagramComponent: (component) =>
      set((state) => ({
        diagramComponents: state.diagramComponents.includes(component)
          ? state.diagramComponents.filter((entry) => entry !== component)
          : [...state.diagramComponents, component],
      })),
    setDiagramScale: (diagramScale) =>
      set({ diagramScale: Math.min(10, Math.max(0.05, diagramScale)) }),
    setShowDiagramLabels: (showDiagramLabels) => set({ showDiagramLabels }),
    setShowReactions: (showReactions) => set({ showReactions }),

    setRenderMode: (renderMode) => set({ renderMode }),
    setColorMode: (colorMode) => set({ colorMode }),
    setOpacity: (opacity) => set({ opacity: Math.min(1, Math.max(0.15, opacity)) }),
    setSectionScale: (sectionScale) =>
      set({ sectionScale: Math.min(8, Math.max(0.25, sectionScale)) }),
    setLoadScale: (loadScale) => set({ loadScale: Math.min(5, Math.max(0.25, loadScale)) }),
    setShowNodes: (showNodes) => set({ showNodes }),
    setShowLabels: (showLabels) => set({ showLabels }),
    setShowSupports: (showSupports) => set({ showSupports }),
    setShowReleases: (showReleases) => set({ showReleases }),
    setShowLoads: (showLoads) => set({ showLoads }),
    setShowGrid: (showGrid) => set({ showGrid }),
    selectFrame: (frameId) =>
      set((state) => {
        if (frameId !== null && !state.model?.frames[frameId]) return state;
        return {
          selectedFrameId: frameId,
          selectedNodeId: null,
          chartStation: null,
        };
      }),
    selectNode: (nodeId) =>
      set((state) => {
        if (nodeId !== null && !state.model?.nodes[nodeId]) return state;
        return {
          selectedFrameId: null,
          selectedNodeId: nodeId,
          chartStation: null,
        };
      }),
    clearSelection: () =>
      set({ selectedFrameId: null, selectedNodeId: null, chartStation: null }),
    setChartStation: (station) =>
      set({
        chartStation:
          station === null || !Number.isFinite(station)
            ? null
            : Math.min(1, Math.max(0, station)),
      }),
    setResultsTablesOpen: (resultsTablesOpen) => set({ resultsTablesOpen }),
    setView: (view) => set((state) => ({ view, viewToken: state.viewToken + 1 })),
    setProjection: (projection) =>
      set((state) => ({ projection, viewToken: state.viewToken + 1 })),
    toggleProjection: () =>
      set((state) => ({
        projection:
          state.projection === "perspective" ? "orthographic" : "perspective",
        viewToken: state.viewToken + 1,
      })),
    fitView: () => set((state) => ({ fitToken: state.fitToken + 1 })),

    setCompareEnabled: (compareEnabled) => set({ compareEnabled }),
    setCompareView: (compareView) =>
      set((state) => ({
        compareView,
        fitToken: state.fitToken + 1,
        viewToken: state.viewToken + 1,
      })),
    setCompareHeatmap: (compareHeatmap) => set({ compareHeatmap }),
    setComparePanelOpen: (comparePanelOpen) => set({ comparePanelOpen }),
  };
});
