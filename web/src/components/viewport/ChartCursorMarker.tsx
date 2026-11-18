import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useModelStore } from "../../store/useModelStore";
import type { PymasModel } from "../../types/pymas";
import {
  autoDeformationScale,
  buildDeformedFrame,
  deformedPointAt,
} from "../../engine/deformation";
import { formatNumber, framePositions, pointAtStation } from "../../engine/geometry";
import {
  buildFrameChartSeries,
  interpolateSeriesAt,
} from "../../engine/inspection";

interface ChartCursorMarkerProps {
  model: PymasModel;
  diagonal: number;
}

/**
 * Marcador 3D sincronizado con el cursor de los gráficos 2D.
 *
 * Sigue la curva deformada cuando la deformada está activa y la barra
 * seleccionada; en caso contrario se apoya en la recta indeformada.
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

  const series = useMemo(() => {
    if (!computedResult || !selectedFrameId || !frameResult) return null;
    return buildFrameChartSeries(computedResult, selectedFrameId);
  }, [computedResult, selectedFrameId, frameResult]);

  const position = useMemo(() => {
    if (!frame || chartStation === null) return null;
    if (deformedCurve) return deformedPointAt(deformedCurve, chartStation);
    const { p1, p2 } = framePositions(frame, model.nodes);
    return pointAtStation(p1, p2, chartStation);
  }, [frame, chartStation, deformedCurve, model.nodes]);

  if (!frame || position === null || chartStation === null) return null;

  const length = Math.max(frame.length, 1e-9);
  const values =
    series?.map((entry) => ({
      key: entry.key,
      label: entry.label.split(" · ")[0],
      value: interpolateSeriesAt(entry.stations, entry.values, chartStation),
    })) ?? [];

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
      <Html
        position={[0, markerRadius * 2.4, 0]}
        center
        distanceFactor={Math.max(diagonal * 1.7, 1)}
        zIndexRange={[50, 0]}
        className="pointer-events-none select-none"
      >
        <div className="w-[178px] rounded-md border border-orange-300/40 bg-slate-950/92 px-1.5 py-1 shadow-xl">
          <div className="mb-0.5 flex items-baseline justify-between gap-2 font-mono text-[8px] text-orange-200">
            <span>
              x = {formatNumber(chartStation * length)} {model.meta.units.length}
            </span>
            <span className="text-slate-500">ξ {chartStation.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-[1px] font-mono text-[8px] leading-tight">
            {values.map((entry) => (
              <div key={entry.key} className="flex justify-between gap-1">
                <span className="text-slate-500">{entry.label}</span>
                <span className="tabular-nums text-slate-100">
                  {formatNumber(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Html>
    </group>
  );
}
