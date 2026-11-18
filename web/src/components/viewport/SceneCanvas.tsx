import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useModelStore, type ViewPreset } from "../../store/useModelStore";
import {
  modelBounds,
  nodeBounds,
  niceGridSize,
  type ModelBounds,
  type Vec3,
} from "../../engine/geometry";
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

function CameraRig({
  bounds,
  view,
  fitToken,
  viewToken,
}: {
  bounds: ModelBounds;
  view: ViewPreset;
  fitToken: number;
  viewToken: number;
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
  }, [camera, controls, bounds, view, fitToken, viewToken]);

  return null;
}

function FrameScene({
  model,
  bounds,
}: {
  model: ReturnType<typeof useModelStore.getState>["model"];
  bounds: ModelBounds;
}) {
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
  const computedResult = useModelStore((state) => state.computedResult);

  if (!model) return null;

  return (
    <group>
      <FrameMesh
        model={model}
        renderMode={renderMode}
        colorMode={colorMode}
        opacity={opacity}
        sectionScale={sectionScale}
        diagonal={bounds.diagonal}
      />
      {computedResult && showDeformed && (
        <DeformedStructure
          model={model}
          result={computedResult}
          diagonal={bounds.diagonal}
        />
      )}
      {computedResult && showForceDiagrams && (
        <ForceDiagrams3D model={model} result={computedResult} />
      )}
      {computedResult && showReactions && (
        <ReactionVectors
          model={model}
          result={computedResult}
          diagonal={bounds.diagonal}
        />
      )}
      <NodeMarkers
        model={model}
        showNodes={showNodes}
        showSupports={showSupports}
        showLabels={showLabels}
        diagonal={bounds.diagonal}
      />
      <ReleaseMarkers
        model={model}
        showReleases={showReleases}
        sectionScale={sectionScale}
        diagonal={bounds.diagonal}
      />
      {showLoads && (
        <LoadVectors
          model={model}
          patternId={activePatternId}
          loadScale={loadScale}
          diagonal={bounds.diagonal}
        />
      )}
      <SelectionTargets model={model} diagonal={bounds.diagonal} />
      <SelectionHighlight model={model} diagonal={bounds.diagonal} />
      {computedResult && (
        <ChartCursorMarker model={model} diagonal={bounds.diagonal} />
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

export default function SceneCanvas() {
  const model = useModelStore((state) => state.model);
  const projection = useModelStore((state) => state.projection);
  const view = useModelStore((state) => state.view);
  const fitToken = useModelStore((state) => state.fitToken);
  const viewToken = useModelStore((state) => state.viewToken);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDown.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointerdown", handleDown, true);
    return () => window.removeEventListener("pointerdown", handleDown, true);
  }, []);

  const bounds = useMemo<ModelBounds>(
    () => (model ? modelBounds(model) : nodeBounds([])),
    [model],
  );

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
      gl={{ antialias: true, powerPreference: "high-performance" }}
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
        clearSelection();
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
      <FrameScene model={model} bounds={bounds} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.8}
        zoomSpeed={1.15}
        panSpeed={0.85}
        screenSpacePanning
      />
      <CameraRig
        bounds={bounds}
        view={view}
        fitToken={fitToken}
        viewToken={viewToken}
      />

      <GizmoHelper alignment="bottom-right" margin={[68, 68]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#e2e8f0"
          hideNegativeAxes={false}
        />
      </GizmoHelper>
    </Canvas>
  );
}
