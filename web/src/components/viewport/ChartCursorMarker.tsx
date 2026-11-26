import { useMemo } from "react";
import { useModelStore } from "../../store/useModelStore";
import type { PymasModel } from "../../types/pymas";
import {
  autoDeformationScale,
  buildDeformedFrame,
  deformedPointAt,
} from "../../engine/deformation";
import { framePositions, pointAtStation } from "../../engine/geometry";

interface ChartCursorMarkerProps {
  model: PymasModel;
  diagonal: number;
}

/**
 * Marcador 3D sincronizado con el cursor de los gráficos 2D.
 *
 * Sigue la curva deformada cuando la deformada está activa y la barra
 * seleccionada; en caso contrario se apoya en la recta indeformada. Los
 * valores se leen en `ChartCursorReadout`, fijo junto al inspector.
 */
export default function ChartCursorMarker({
  model,
  diagonal,
}: ChartCursorMarkerProps) {
  const selectedFrameId = useModelStore((state) => state.selectedFrameId);
  const chartStation = useModelStore((state) => state.chartStation);
  const computedResult = useModelStore((state) => state.computedResult);
  const showDeformed = useModelStore((state) => state.showDeformed);
  const deformationScale = useModelStore((state) => state.deformationScale);

  const frame = selectedFrameId ? model.frames[selectedFrameId] : undefined;
  const frameResult =
    selectedFrameId && computedResult
      ? computedResult.frameResults[selectedFrameId]
      : undefined;

  const deformationFactor = useMemo(() => {
    if (!computedResult || !showDeformed) return null;
    return (
      autoDeformationScale(model, computedResult, 0.08) *
      Math.max(deformationScale, 0.01)
    );
  }, [model, computedResult, showDeformed, deformationScale]);

  const deformedCurve = useMemo(() => {
    if (
      !showDeformed ||
      !computedResult ||
      !selectedFrameId ||
      !frameResult
    ) {
      return null;
    }
    try {
      return buildDeformedFrame(model, computedResult, selectedFrameId, {
        scale: deformationFactor ?? 1,
      });
    } catch {
      return null;
    }
  }, [
    model,
    computedResult,
    selectedFrameId,
    frameResult,
    showDeformed,
    deformationFactor,
  ]);

  const position = useMemo(() => {
    if (!frame || chartStation === null) return null;
    if (deformedCurve) return deformedPointAt(deformedCurve, chartStation);
    const { p1, p2 } = framePositions(frame, model.nodes);
    return pointAtStation(p1, p2, chartStation);
  }, [frame, chartStation, deformedCurve, model.nodes]);

  if (!frame || position === null || chartStation === null) return null;

  const markerRadius = Math.max(diagonal * 0.009, 1e-5);

  return (
    <group position={position}>
      <mesh renderOrder={32}>
        <sphereGeometry args={[markerRadius, 18, 12]} />
        <meshBasicMaterial
          color="#fb923c"
          transparent
          opacity={0.95}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={31}>
        <sphereGeometry args={[markerRadius * 2.1, 18, 12]} />
        <meshBasicMaterial
          color="#fdba74"
          transparent
          opacity={0.22}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
