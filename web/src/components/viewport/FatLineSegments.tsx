import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

/** Anchos de línea en píxeles de pantalla. */
export const WIRE_LINE_PX = 2.5;
export const DEFORMED_LINE_PX = 3.5;
export const GHOST_LINE_PX = 1.5;

export interface FatLineSegmentsHandle {
  /**
   * Reescribe las posiciones sin recrear la geometría (animación). El arreglo
   * debe tener la misma longitud que el inicial: pares de puntos `a, b`.
   */
  setPositions: (positions: Float32Array) => void;
}

interface FatLineSegmentsProps {
  /** Pares de puntos (xyz, xyz) por segmento, igual que `LineSegments`. */
  positions: Float32Array;
  /** Colores por vértice con el mismo diseño que `positions`. */
  colors?: Float32Array;
  color?: THREE.ColorRepresentation;
  widthPx: number;
  opacity?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  depthWrite?: boolean;
  toneMapped?: boolean;
  renderOrder?: number;
}

/**
 * Segmentos con grosor real en píxeles.
 *
 * WebGL ignora `linewidth` en `LineBasicMaterial` (siempre 1 px), por eso el
 * alambre y la deformada usan `LineSegments2` + `LineMaterial`, que dibujan
 * cada segmento como un quad orientado a la cámara. Todo el modelo cabe en un
 * único objeto, así que el costo no crece con el número de barras.
 */
const FatLineSegments = forwardRef<FatLineSegmentsHandle, FatLineSegmentsProps>(
  function FatLineSegments(
    {
      positions,
      colors,
      color = "#ffffff",
      widthPx,
      opacity = 1,
      dashed = false,
      dashSize = 1,
      gapSize = 1,
      depthWrite = true,
      toneMapped = true,
      renderOrder = 0,
    },
    ref,
  ) {
    const size = useThree((state) => state.size);

    const geometry = useMemo(() => {
      const value = new LineSegmentsGeometry();
      value.setPositions(positions);
      if (colors && colors.length === positions.length) value.setColors(colors);
      return value;
    }, [positions, colors]);

    const material = useMemo(
      () =>
        new LineMaterial({
          linewidth: widthPx,
          vertexColors: Boolean(colors),
          transparent: opacity < 0.999,
          worldUnits: false,
        }),
      // Solo se recrea al cambiar entre color por vértice y color único; el
      // resto de propiedades se actualiza en el efecto siguiente.
      [Boolean(colors)],
    );

    useEffect(() => {
      material.linewidth = widthPx;
      material.opacity = opacity;
      material.transparent = opacity < 0.999;
      material.color.set(colors ? "#ffffff" : color);
      material.dashed = dashed;
      material.dashSize = dashSize;
      material.gapSize = gapSize;
      material.depthWrite = depthWrite;
      material.toneMapped = toneMapped;
      material.needsUpdate = true;
    }, [
      material,
      widthPx,
      opacity,
      color,
      colors,
      dashed,
      dashSize,
      gapSize,
      depthWrite,
      toneMapped,
    ]);

    useEffect(() => {
      material.resolution.set(size.width, size.height);
    }, [material, size.width, size.height]);

    const line = useMemo(() => {
      const value = new LineSegments2(geometry, material);
      value.frustumCulled = false;
      return value;
    }, [geometry, material]);

    useEffect(() => {
      line.renderOrder = renderOrder;
    }, [line, renderOrder]);

    useEffect(() => {
      if (dashed) line.computeLineDistances();
    }, [line, dashed]);

    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);

    useImperativeHandle(
      ref,
      () => ({
        setPositions: (next: Float32Array) => {
          const attribute = geometry.getAttribute("instanceStart") as
            | THREE.InterleavedBufferAttribute
            | undefined;
          if (!attribute) return;
          const buffer = attribute.data;
          const target = buffer.array as Float32Array;
          if (target.length !== next.length) {
            geometry.setPositions(next);
            return;
          }
          target.set(next);
          buffer.needsUpdate = true;
        },
      }),
      [geometry],
    );

    return <primitive object={line} />;
  },
);

export default FatLineSegments;
