import { useEffect, useRef, useState } from "react";
import { useModelStore } from "./store/useModelStore";
import { fileNameFromUrl, resolveModelParam } from "./lib/assets";
import SceneCanvas from "./components/viewport/SceneCanvas";
import TopToolbar from "./components/ui/TopToolbar";
import ControlSidebar from "./components/ui/ControlSidebar";
import EquilibriumBar from "./components/ui/EquilibriumBar";
import WelcomeOverlay from "./components/ui/WelcomeOverlay";
import LoadingOverlay from "./components/ui/LoadingOverlay";
import ErrorToast from "./components/ui/ErrorToast";
import DropZoneOverlay from "./components/ui/DropZoneOverlay";
import ElementInspector from "./components/ui/ElementInspector";
import ChartCursorReadout from "./components/ui/ChartCursorReadout";
import HeatLegendOverlay from "./components/ui/HeatLegendOverlay";
import ResultsTables from "./components/ui/ResultsTables";
import ComparePanel, { CompareLegend } from "./components/ui/ComparePanel";
import { useGlobalDrop } from "./components/ui/useGlobalDrop";

export default function App() {
  const model = useModelStore((state) => state.model);
  const loadingModel = useModelStore((state) => state.loadingModel);
  const loadingSamples = useModelStore((state) => state.loadingSamples);
  const loadSamples = useModelStore((state) => state.loadSamples);
  const loadFromUrl = useModelStore((state) => state.loadFromUrl);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1024,
  );
  const dropState = useGlobalDrop();
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    void (async () => {
      await loadSamples();
      const state = useModelStore.getState();
      const param = new URLSearchParams(window.location.search).get("model")?.trim();

      if (param) {
        const url = resolveModelParam(param);
        const fileName = fileNameFromUrl(url);
        const sample = state.samples.find((entry) => entry.file === fileName);
        if (sample) {
          await state.loadSample(sample);
        } else {
          await loadFromUrl(url, fileName, null);
        }
        return;
      }

      const preferred =
        state.samples.find((entry) => entry.file === "space_frame.json") ??
        state.samples[0];
      if (preferred) await state.loadSample(preferred);
    })();
  }, [loadSamples, loadFromUrl]);

  useEffect(() => {
    document.title = model
      ? `${model.meta.name} · PyMAS Studio 3D`
      : "PyMAS Studio 3D";
  }, [model]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const state = useModelStore.getState();
      if (state.resultsTablesOpen) {
        state.setResultsTablesOpen(false);
        return;
      }
      if (state.comparePanelOpen) {
        state.setComparePanelOpen(false);
        return;
      }
      if (state.selectedFrameId || state.selectedNodeId) {
        state.clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loading = loadingModel || (!model && loadingSamples);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <TopToolbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="relative min-w-0 flex-1">
          <SceneCanvas />

          {!model && !loading && <WelcomeOverlay />}

          {loading && (
            <LoadingOverlay
              message={loadingModel ? "Cargando modelo…" : "Cargando ejemplos…"}
            />
          )}

          <ErrorToast />

          <ElementInspector />
          <ChartCursorReadout />
          {model && <HeatLegendOverlay />}

          <ComparePanel />
          <CompareLegend />

          {model && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-500 backdrop-blur sm:flex">
              <span className="font-mono text-sky-400">Z↑</span>
              <span className="h-3 w-px bg-white/10" />
              <span>Orbitar: arrastrar</span>
              <span className="text-slate-700">·</span>
              <span>Zoom: rueda</span>
              <span className="text-slate-700">·</span>
              <span>Desplazar: botón derecho</span>
            </div>
          )}

          <DropZoneOverlay active={dropState.active} count={dropState.jsonCount} />
        </main>

        <ControlSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <ResultsTables />
      <EquilibriumBar />
    </div>
  );
}
