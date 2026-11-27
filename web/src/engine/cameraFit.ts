import type { Vec3 } from "./geometry";

/**
 * Encuadre de cámara que deja visibles todos los puntos dados con el mayor
 * tamaño posible en pantalla.
 *
 * La orientación es dato (dirección hacia la cámara y vector arriba): el
 * encuadre sólo decide el objetivo y la distancia (perspectiva) o el zoom
 * (ortográfica). Los puntos suelen ser las 8 esquinas de la caja envolvente
 * de todo lo dibujado: barras, cargas, diagramas y deformada.
 */

export type FitProjection =
  | {
      type: "orthographic";
      /** Tamaño del visor en píxeles CSS (frustum de la cámara de R3F). */
      width: number;
      height: number;
    }
  | {
      type: "perspective";
      /** Campo de visión vertical en grados. */
      fov: number;
      aspect: number;
    };

export interface CameraFit {
  target: Vec3;
  position: Vec3;
  /** Zoom de la cámara ortográfica (1 en perspectiva). */
  zoom: number;
  /** Distancia del objetivo a la cámara. */
  distance: number;
  /** Semiprofundidad del contenido a lo largo de la visual. */
  depth: number;
}

/** Fracción del visor que ocupa el contenido en la dimensión limitante. */
export const FIT_MARGIN = 0.92;

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-12
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 0, 1];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Base de la cámara con la convención de `Object3D.lookAt` de three.js. */
export function cameraBasis(
  direction: Vec3,
  up: Vec3,
): { right: Vec3; up: Vec3; back: Vec3 } {
  const back = normalize(direction);
  let right = cross(up, back);
  if (Math.hypot(...right) < 1e-9) {
    // Arriba paralelo a la visual: se toma cualquier perpendicular.
    right = cross(Math.abs(back[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], back);
  }
  right = normalize(right);
  return { right, up: cross(back, right), back };
}

/** Las 8 esquinas de una caja alineada con los ejes. */
export function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

export function fitCameraToPoints(
  points: readonly Vec3[],
  direction: Vec3,
  up: Vec3,
  projection: FitProjection,
  margin = FIT_MARGIN,
): CameraFit | null {
  const finite = points.filter((point) => point.every(Number.isFinite));
  if (finite.length === 0) return null;

  const basis = cameraBasis(direction, up);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of finite) {
    const x = dot(point, basis.right);
    const y = dot(point, basis.up);
    const z = dot(point, basis.back);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const target: Vec3 = [
    basis.right[0] * cx + basis.up[0] * cy + basis.back[0] * cz,
    basis.right[1] * cx + basis.up[1] * cy + basis.back[1] * cz,
    basis.right[2] * cx + basis.up[2] * cy + basis.back[2] * cz,
  ];
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const depth = Math.max((maxZ - minZ) / 2, 1e-9);
  const extent = Math.max(spanX, spanY, depth * 2);
  const scale = Math.min(Math.max(margin, 0.05), 1);

  let zoom = 1;
  let distance: number;
  if (projection.type === "orthographic") {
    const width = Math.max(projection.width, 1);
    const height = Math.max(projection.height, 1);
    zoom = Math.min(width / spanX, height / spanY) * scale;
    // En ortográfica la distancia no cambia el tamaño: basta con quedar fuera.
    distance = depth + extent * 2;
  } else {
    const tanV = Math.tan((projection.fov * Math.PI) / 360) * scale;
    const tanH = tanV * Math.max(projection.aspect, 1e-6);
    distance = 0;
    for (const point of finite) {
      const x = Math.abs(dot(point, basis.right) - cx);
      const y = Math.abs(dot(point, basis.up) - cy);
      const z = dot(point, basis.back) - cz;
      distance = Math.max(distance, x / tanH + z, y / tanV + z);
    }
    distance = Math.max(distance, depth * 1.05, extent * 1e-3);
  }

  const position: Vec3 = [
    target[0] + basis.back[0] * distance,
    target[1] + basis.back[1] * distance,
    target[2] + basis.back[2] * distance,
  ];
  return { target, position, zoom, distance, depth };
}
