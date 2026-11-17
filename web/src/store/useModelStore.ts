import { create } from "zustand";
import type { PymasModel, SampleEntry, SampleManifest } from "../types/pymas";
import { parsePymasJson, PymasParseError } from "../engine/parser";
import { assetUrl } from "../lib/assets";
import type { ColorMode } from "../engine/colors";

export type RenderMode = "wire" | "extruded";
export type ViewPreset = "iso" | "plan" | "front" | "side";
export type ProjectionMode = "perspective" | "orthographic";

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

  view: ViewPreset;
  projection: ProjectionMode;
  fitToken: number;
  viewToken: number;
}

export interface ModelActions {
  loadSamples: () => Promise<void>;
  loadFromUrl: (url: string, label?: string, sourceFile?: string | null) => Promise<void>;
  loadSample: (entry: SampleEntry) => Promise<void>;
  loadFromFile: (file: File) => Promise<void>;
  loadText: (text: string, label: string, sourceFile?: string | null) => Promise<void>;
  dismissError: () => void;
  setActivePattern: (patternId: string | null) => void;
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
  setView: (view: ViewPreset) => void;
  setProjection: (projection: ProjectionMode) => void;
  toggleProjection: () => void;
  fitView: () => void;
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

  view: "iso",
  projection: "perspective",
  fitToken: 0,
  viewToken: 0,
};

export const useModelStore = create<ModelStore>((set, get) => {
  const applyParsedModel = (
    model: PymasModel,
    label: string,
    sourceFile: string | null,
  ): void => {
    set((state) => ({
      model,
      sourceLabel: label,
      sourceFile,
      activePatternId: model.loadPatternOrder[0] ?? null,
      colorMode: defaultColorMode(model),
      view: defaultView(model),
      fitToken: state.fitToken + 1,
      viewToken: state.viewToken + 1,
      loadingModel: false,
      error: null,
    }));
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

    dismissError: () => set({ error: null }),

    setActivePattern: (patternId) => {
      const model = get().model;
      if (patternId !== null && !model?.loadPatterns[patternId]) return;
      set({ activePatternId: patternId });
    },

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
  };
});
