import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useModelStore,
  type RenderMode,
  type ViewPreset,
} from "../../store/useModelStore";
import {
  modelBounds,
  nodeBounds,
  niceGridSize,
  type ModelBounds,
  type Vec3,
} from "../../engine/geometry";
import type { PatternResultData, PymasModel } from "../../types/pymas";
import { comparisonFrameColorMap } from "../../engine/comparison";
import FrameMesh from "./FrameMesh";
import NodeMarkers from "./NodeMarkers";
import ReleaseMarkers from "./ReleaseMarkers";
import LoadVectors from "./LoadVectors";
import DeformedStructure from "./DeformedStructure";
import ForceDiagrams3D from "./ForceDiagrams3D";
import ReactionVectors from "./ReactionVectors";
import SelectionTargets from "./SelectionTargets";
import SelectionHighlight from "./SelectionHighlight";
import ChartCursorMarker from "./ChartCursorMarker";
import { registerCapture, type CaptureBackground } from "./captureRegistry";

const VIEW_DIRECTIONS: Record<ViewPreset, Vec3> = {
  iso: [1, -1, 0.82],
  plan: [0, 0, 1],
  front: [0, -1, 0],
  side: [1, 0, 0],
};

const CAMERA_UP: Record<ViewPreset, Vec3> = {
  iso: [0, 0, 1],
  plan: [0, 1, 0],
  front: [0, 0, 1],
  side: [0, 0, 1],
};

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
  minDistance: number;
  maxDistance: number;
}

interface CameraSyncState {
  activePane: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  zoom: number;
  listeners: Set<() => void>;
}

function createCameraSync(): CameraSyncState {
  return {
    activePane: "a",
    position: new THREE.Vector3(1, -1, 0.82),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(0, 0, 1),
    zoom: 1,
    listeners: new Set(),
  };
}

function CameraRig({
  bounds,
  view,
  fitToken,
  viewToken,
  sync,
  paneId,
}: {
  bounds: ModelBounds;
  view: ViewPreset;
  fitToken: number;
  viewToken: number;
  sync: CameraSyncState | null;
  paneId: string;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsLike | null;
  const size = useThree((state) => state.size);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    if (!controls) return;
    const target = new THREE.Vector3(...bounds.center);
    const direction = new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize();
    const up = new THREE.Vector3(...CAMERA_UP[view]);
    const radius = Math.max(bounds.diagonal / 2, 1e-4);
    const margin = 1.35;

    camera.up.copy(up);

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspective = camera as THREE.PerspectiveCamera;
      const fov = THREE.MathUtils.degToRad(perspective.fov);
      const distance = (radius / Math.max(Math.sin(fov / 2), 1e-4)) * margin;
      perspective.position.copy(target).addScaledVector(direction, distance);
      perspective.near = Math.max(distance * 0.001, 1e-4);
      perspective.far = Math.max(distance * 200, 1e6);
      perspective.updateProjectionMatrix();
      controls.minDistance = radius * 0.02;
      controls.maxDistance = radius * 80;
    } else {
      const orthographic = camera as THREE.OrthographicCamera;
      const { width, height } = sizeRef.current;
      const fit = Math.min(width, height) / (2 * radius * margin);
      orthographic.position
        .copy(target)
        .addScaledVector(direction, Math.max(radius * 6, 10));
      orthographic.near = 0.01;
      orthographic.far = Math.max(radius * 400, 10_000);
      orthographic.zoom = Math.max(fit, 0.0001);
      orthographic.updateProjectionMatrix();
      controls.minDistance = radius * 6;
      controls.maxDistance = radius * 6;
    }

    camera.lookAt(target);
    controls.target.copy(target);
    controls.update();

    // El encuadre recién calculado es la referencia compartida del split.
    if (sync) {
      sync.activePane = paneId;
      sync.position.copy(camera.position);
      sync.up.copy(camera.up);
      if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
        sync.zoom = (camera as THREE.OrthographicCamera).zoom;
      }
      sync.target.copy(controls.target);
      for (const listener of sync.listeners) listener();
    }
  }, [camera, controls, bounds, view, fitToken, viewToken, sync, paneId]);

  return null;
}

interface ModelLayerProps {
  model: PymasModel;
  result: PatternResultData | null;
  bounds: ModelBounds;
  colorForFrame?: (frameId: string) => string | null;
  renderModeOverride?: RenderMode;
  opacityOverride?: number;
  /** Capa B superpuesta: solo barras y nudos, sin cargas ni diagramas. */
  ghost?: boolean;
  selectable?: boolean;
}

function ModelLayer({
  model,
  result,
  bounds,
  colorForFrame,
  renderModeOverride,
  opacityOverride,
  ghost = false,
  selectable = false,
}: ModelLayerProps) {
  const renderMode = useModelStore((state) => state.renderMode);
  const colorMode = useModelStore((state) => state.colorMode);
  const opacity = useModelStore((state) => state.opacity);
  const sectionScale = useModelStore((state) => state.sectionScale);
  const loadScale = useModelStore((state) => state.loadScale);
  const activePatternId = useModelStore((state) => state.activePatternId);
  const showNodes = useModelStore((state) => state.showNodes);
  const showLabels = useModelStore((state) => state.showLabels);
  const showSupports = useModelStore((state) => state.showSupports);
  const showReleases = useModelStore((state) => state.showReleases);
  const showLoads = useModelStore((state) => state.showLoads);
  const showDeformed = useModelStore((state) => state.showDeformed);
  const showForceDiagrams = useModelStore((state) => state.showForceDiagrams);
  const showReactions = useModelStore((state) => state.showReactions);

  return (
    <group>
      <FrameMesh
        model={model}
        renderMode={renderModeOverride ?? renderMode}
        colorMode={colorMode}
        opacity={opacityOverride ?? opacity}
        sectionScale={sectionScale}
        diagonal={bounds.diagonal}
        colorForFrame={colorForFrame}
      />
      {!ghost && result && showDeformed && (
        <DeformedStructure
          model={model}
          result={result}
          diagonal={bounds.diagonal}
        />
      )}
      {!ghost && result && showForceDiagrams && (
        <ForceDiagrams3D model={model} result={result} />
      )}
      {!ghost && result && showReactions && (
        <ReactionVectors
          model={model}
          result={result}
          diagonal={bounds.diagonal}
        />
      )}
      <NodeMarkers
        model={model}
        showNodes={showNodes}
        showSupports={ghost ? false : showSupports}
        showLabels={selectable ? showLabels : false}
        diagonal={bounds.diagonal}
      />
      {!ghost && (
        <ReleaseMarkers
          model={model}
          showReleases={showReleases}
          sectionScale={sectionScale}
          diagonal={bounds.diagonal}
        />
      )}
      {!ghost && showLoads && (
        <LoadVectors
          model={model}
          patternId={activePatternId}
          loadScale={loadScale}
          diagonal={bounds.diagonal}
        />
      )}
      {selectable && (
        <>
          <SelectionTargets model={model} diagonal={bounds.diagonal} />
          <SelectionHighlight model={model} diagonal={bounds.diagonal} />
          {result && <ChartCursorMarker model={model} diagonal={bounds.diagonal} />}
        </>
      )}
    </group>
  );
}

function Grid({ bounds }: { bounds: ModelBounds }) {
  const showGrid = useModelStore((state) => state.showGrid);
  const grid = useMemo(() => niceGridSize(bounds.diagonal), [bounds.diagonal]);
  if (!showGrid) return null;

  return (
    <gridHelper
      args={[grid.size, grid.divisions, "#334155", "#111c2e"]}
      position={[bounds.center[0], bounds.center[1], 0]}
      rotation={[Math.PI / 2, 0, 0]}
    />
  );
}

/**
 * Controles de órbita con sincronización opcional entre los dos paneles del
 * modo dividido: el panel con el que interactúa el usuario publica su cámara y
 * el otro la aplica sin devolver el evento (evita bucles).
 */
function PaneControls({
  id,
  sync,
}: {
  id: string;
  sync: CameraSyncState | null;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsLike | null;
  const applying = useRef(false);

  useEffect(() => {
    if (!sync || !controls) return;
    const apply = () => {
      if (sync.activePane === id) return;
      applying.current = true;
      camera.position.copy(sync.position);
      camera.up.copy(sync.up);
      if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
        (camera as THREE.OrthographicCamera).zoom = sync.zoom;
        camera.updateProjectionMatrix();
      }
      controls.target.copy(sync.target);
      camera.lookAt(sync.target);
      controls.update();
      applying.current = false;
    };
    sync.listeners.add(apply);
    return () => {
      sync.listeners.delete(apply);
    };
  }, [camera, controls, id, sync]);

  const handleChange = () => {
    if (!sync || applying.current || sync.activePane !== id || !controls) return;
    sync.position.copy(camera.position);
    sync.up.copy(camera.up);
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      sync.zoom = (camera as THREE.OrthographicCamera).zoom;
    }
    sync.target.copy(controls.target);
    for (const listener of sync.listeners) listener();
  };

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.8}
      zoomSpeed={1.15}
      panSpeed={0.85}
      screenSpacePanning
      onStart={() => {
        if (sync) sync.activePane = id;
      }}
      onChange={handleChange}
    />
  );
}

/**
 * Puente entre el renderer de three y la exportación PNG. Re-renderiza a mayor
 * pixel ratio y con el fondo solicitado (oscuro o blanco para informes).
 */
function CaptureBridge({ id }: { id: string }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const capture = (
      scale: number,
      background: CaptureBackground,
    ): HTMLCanvasElement | null => {
      const previousRatio = gl.getPixelRatio();
      const previousSize = gl.getSize(new THREE.Vector2());
      const previousBackground = scene.background;
      try {
        scene.background = new THREE.Color(
          background === "white" ? "#ffffff" : "#060a13",
        );
        gl.setPixelRatio(scale);
        gl.setSize(size.width, size.height, false);
        gl.render(scene, camera);
        const source = gl.domElement;
        const output = document.createElement("canvas");
        output.width = source.width;
        output.height = source.height;
        const context = output.getContext("2d");
        if (!context) return null;
        context.drawImage(source, 0, 0);
        return output;
      } finally {
        scene.background = previousBackground;
        gl.setPixelRatio(previousRatio);
        gl.setSize(previousSize.x, previousSize.y, false);
        gl.render(scene, camera);
      }
    };
    return registerCapture(id, capture);
  }, [gl, scene, camera, size.width, size.height]);

  return null;
}

interface ScenePaneProps {
  id: string;
  bounds: ModelBounds;
  projection: "perspective" | "orthographic";
  sync: CameraSyncState | null;
  onBackgroundClick: () => void;
  children: ReactNode;
}

function ScenePane({
  id,
  bounds,
  projection,
  sync,
  onBackgroundClick,
  children,
}: ScenePaneProps) {
  const view = useModelStore((state) => state.view);
  const fitToken = useModelStore((state) => state.fitToken);
  const viewToken = useModelStore((state) => state.viewToken);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDown.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointerdown", handleDown, true);
    return () => window.removeEventListener("pointerdown", handleDown, true);
  }, []);

  const distance = Math.max(bounds.diagonal * 1.6, 1);
  const initialPosition: [number, number, number] = [
    bounds.center[0] + distance,
    bounds.center[1] - distance,
    bounds.center[2] + distance * 0.82,
  ];

  return (
    <Canvas
      key={projection}
      dpr={[1, 1.75]}
      orthographic={projection === "orthographic"}
      camera={
        projection === "perspective"
          ? {
              position: initialPosition,
              fov: 42,
              near: 0.01,
              far: 1e7,
            }
          : {
              position: initialPosition,
              zoom: 1,
              near: 0.01,
              far: 1e7,
            }
      }
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      onPointerMissed={(event) => {
        const start = pointerDown.current;
        pointerDown.current = null;
        if (!start || event.button !== 0) return;
        const travelled = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        );
        if (travelled > 5) return;
        onBackgroundClick();
      }}
    >
      <color attach="background" args={["#060a13"]} />

      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#dbeafe", "#0f172a", 0.95]} />
      <directionalLight
        position={[
          bounds.center[0] + bounds.diagonal * 1.2,
          bounds.center[1] - bounds.diagonal * 1.6,
          bounds.center[2] + bounds.diagonal * 2.1,
        ]}
        intensity={1.7}
      />
      <directionalLight
        position={[
          bounds.center[0] - bounds.diagonal * 1.5,
          bounds.center[1] + bounds.diagonal * 1.2,
          bounds.center[2] + bounds.diagonal * 0.9,
        ]}
        color="#93c5fd"
        intensity={0.55}
      />

      <Grid bounds={bounds} />
      {children}

      <PaneControls id={id} sync={sync} />
      <CameraRig
        bounds={bounds}
        view={view}
        fitToken={fitToken}
        viewToken={viewToken}
        sync={sync}
        paneId={id}
      />

      <GizmoHelper alignment="bottom-right" margin={[68, 68]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#e2e8f0"
          hideNegativeAxes={false}
        />
      </GizmoHelper>
      <CaptureBridge id={id} />
    </Canvas>
  );
}

function PaneBadge({ label, name }: { label: string; name: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[70%] items-center gap-2 rounded-lg border border-white/10 bg-slate-950/75 px-2 py-1 text-[10px] backdrop-blur">
      <span className="rounded bg-white/10 px-1.5 py-0.5 font-semibold text-white">
        {label}
      </span>
      <span className="truncate text-slate-400">{name}</span>
    </div>
  );
}

export default function SceneCanvas() {
  const model = useModelStore((state) => state.model);
  const sourceLabel = useModelStore((state) => state.sourceLabel);
  const computedResult = useModelStore((state) => state.computedResult);
  const projection = useModelStore((state) => state.projection);
  const clearSelection = useModelStore((state) => state.clearSelection);

  const compareEnabled = useModelStore((state) => state.compareEnabled);
  const compareModel = useModelStore((state) => state.compareModel);
  const compareSourceLabel = useModelStore((state) => state.compareSourceLabel);
  const compareResult = useModelStore((state) => state.compareResult);
  const compareComparison = useModelStore((state) => state.compareComparison);
  const compareView = useModelStore((state) => state.compareView);
  const compareHeatmap = useModelStore((state) => state.compareHeatmap);

  const comparing = Boolean(compareEnabled && compareModel);
  const split = comparing && compareView === "split";

  const sync = useMemo<CameraSyncState | null>(
    () => (split ? createCameraSync() : null),
    [split],
  );

  const bounds = useMemo<ModelBounds>(() => {
    if (!model) return nodeBounds([]);
    const base = modelBounds(model);
    if (!comparing || !compareModel) return base;
    const other = modelBounds(compareModel);
    const min: Vec3 = [
      Math.min(base.min[0], other.min[0]),
      Math.min(base.min[1], other.min[1]),
      Math.min(base.min[2], other.min[2]),
    ];
    const max: Vec3 = [
      Math.max(base.max[0], other.max[0]),
      Math.max(base.max[1], other.max[1]),
      Math.max(base.max[2], other.max[2]),
    ];
    const center: Vec3 = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
    const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    return {
      min,
      max,
      center,
      size,
      diagonal: Math.hypot(size[0], size[1], size[2]),
    };
  }, [model, comparing, compareModel]);

  const heatColors = useMemo(
    () =>
      comparing && compareHeatmap
        ? comparisonFrameColorMap(compareComparison)
        : null,
    [comparing, compareHeatmap, compareComparison],
  );

  const colorForBase = useMemo(
    () =>
      heatColors && heatColors.size > 0
        ? (frameId: string) => heatColors.get(frameId) ?? null
        : undefined,
    [heatColors],
  );

  if (!model) {
    return (
      <div className="absolute inset-0">
        <ScenePane
          id="a"
          bounds={bounds}
          projection={projection}
          sync={null}
          onBackgroundClick={clearSelection}
        >
          {null}
        </ScenePane>
      </div>
    );
  }

  const baseLayer = (
    <ModelLayer
      model={model}
      result={computedResult}
      bounds={bounds}
      colorForFrame={colorForBase}
      selectable
    />
  );

  if (!split) {
    return (
      <div className="absolute inset-0">
        <ScenePane
          id="a"
          bounds={bounds}
          projection={projection}
          sync={null}
          onBackgroundClick={clearSelection}
        >
          {baseLayer}
          {comparing && compareModel && (
            <ModelLayer
              model={compareModel}
              result={compareResult}
              bounds={bounds}
              colorForFrame={() => "#f59e0b"}
              renderModeOverride="wire"
              opacityOverride={0.62}
              ghost
            />
          )}
        </ScenePane>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex">
      <div className="relative min-w-0 flex-1">
        <ScenePane
          id="a"
          bounds={bounds}
          projection={projection}
          sync={sync}
          onBackgroundClick={clearSelection}
        >
          {baseLayer}
        </ScenePane>
        <PaneBadge label="A · Base" name={sourceLabel ?? "Modelo base"} />
      </div>
      <div className="w-px shrink-0 bg-white/10" />
      <div className="relative min-w-0 flex-1">
        <ScenePane
          id="b"
          bounds={bounds}
          projection={projection}
          sync={sync}
          onBackgroundClick={clearSelection}
        >
          {compareModel && (
            <ModelLayer
              model={compareModel}
              result={compareResult}
              bounds={bounds}
            />
          )}
        </ScenePane>
        <PaneBadge
          label="B · Modificado"
          name={compareSourceLabel ?? "Modelo modificado"}
        />
      </div>
    </div>
  );
}
