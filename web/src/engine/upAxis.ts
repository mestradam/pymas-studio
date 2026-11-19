import type { Vec3 } from "./geometry";

/**
 * Eje global del modelo que se muestra hacia arriba en el visor.
 *
 * La escena 3D trabaja siempre en un sistema de **vista** Z-up (grilla en el
 * plano XY de la vista, cámara, luces y vistas CAD). El modelo conserva sus
 * coordenadas originales y se coloca dentro de un grupo rotado; esta rotación
 * es una permutación cíclica de ejes, por lo que sigue siendo una rotación
 * propia (sin espejos) y no requiere signos negativos en las etiquetas.
 *
 *   up = z  ->  vista (X, Y, Z) = modelo (X, Y, Z)
 *   up = x  ->  vista (X, Y, Z) = modelo (Y, Z, X)
 *   up = y  ->  vista (X, Y, Z) = modelo (Z, X, Y)
 */
export type UpAxis = "x" | "y" | "z";

export const UP_AXES: readonly UpAxis[] = ["x", "y", "z"];

export const DEFAULT_UP_AXIS: UpAxis = "z";

type AxisIndex = 0 | 1 | 2;

/** Índice del eje del modelo que ocupa cada eje de la vista (X, Y, Z). */
const VIEW_TO_MODEL: Record<UpAxis, readonly [AxisIndex, AxisIndex, AxisIndex]> = {
  z: [0, 1, 2],
  x: [1, 2, 0],
  y: [2, 0, 1],
};

const AXIS_NAMES = ["X", "Y", "Z"] as const;
export type AxisName = (typeof AXIS_NAMES)[number];

const UP_AXIS_CYCLE: Record<UpAxis, UpAxis> = { z: "x", x: "y", y: "z" };

/** Siguiente eje del ciclo Z → X → Y → Z (botón compacto de la barra superior). */
export function nextUpAxis(up: UpAxis): UpAxis {
  return UP_AXIS_CYCLE[up];
}

export function isUpAxis(value: unknown): value is UpAxis {
  return value === "x" || value === "y" || value === "z";
}

/** Índice (0, 1, 2) del eje vertical en coordenadas del modelo. */
export function upAxisIndex(up: UpAxis): number {
  return VIEW_TO_MODEL[up][2];
}

/** Índices de los dos ejes horizontales del modelo (orden de la vista X, Y). */
export function horizontalAxisIndices(up: UpAxis): [number, number] {
  const [h, d] = VIEW_TO_MODEL[up];
  return [h, d];
}

/** Nombres de los ejes del modelo que ocupan la vista X, Y y Z. */
export function viewAxisNames(up: UpAxis): [AxisName, AxisName, AxisName] {
  const [a, b, c] = VIEW_TO_MODEL[up];
  return [AXIS_NAMES[a], AXIS_NAMES[b], AXIS_NAMES[c]];
}

/** Convierte un punto/vector del modelo a coordenadas de la vista. */
export function modelToView(vector: Vec3, up: UpAxis): Vec3 {
  const [a, b, c] = VIEW_TO_MODEL[up];
  return [vector[a], vector[b], vector[c]];
}

/** Convierte un punto/vector de la vista a coordenadas del modelo. */
export function viewToModel(vector: Vec3, up: UpAxis): Vec3 {
  const map = VIEW_TO_MODEL[up];
  const out: Vec3 = [0, 0, 0];
  out[map[0]] = vector[0];
  out[map[1]] = vector[1];
  out[map[2]] = vector[2];
  return out;
}

/**
 * Matriz 3×3 (por filas) que lleva coordenadas del modelo a la vista. Lista
 * para `Matrix4.set` (completando con la fila/columna homogénea).
 */
export function modelToViewMatrix(up: UpAxis): number[][] {
  return VIEW_TO_MODEL[up].map((modelIndex) =>
    [0, 1, 2].map((column) => (column === modelIndex ? 1 : 0)),
  );
}

export type ViewPlanePreset = "plan" | "front" | "side";

/**
 * Plano del modelo que muestra cada vista CAD con el eje vertical activo.
 * El primer eje es el horizontal en pantalla y el segundo el vertical.
 */
export function viewPlaneAxes(
  preset: ViewPlanePreset,
  up: UpAxis,
): [AxisName, AxisName] {
  const [h, d, u] = viewAxisNames(up);
  switch (preset) {
    case "plan":
      return [h, d];
    case "front":
      return [h, u];
    case "side":
      return [d, u];
  }
}

export function viewPlaneLabel(preset: ViewPlanePreset, up: UpAxis): string {
  return viewPlaneAxes(preset, up).join("");
}

/** Vista CAD que muestra el plano formado por los dos ejes dados. */
export function presetForPlane(
  first: AxisName,
  second: AxisName,
  up: UpAxis,
): ViewPlanePreset {
  const wanted = new Set([first, second]);
  for (const preset of ["plan", "front", "side"] as const) {
    const axes = viewPlaneAxes(preset, up);
    if (wanted.has(axes[0]) && wanted.has(axes[1])) return preset;
  }
  return "plan";
}
