export type CaptureBackground = "dark" | "white";

export type CaptureFn = (
  scale: number,
  background: CaptureBackground,
) => HTMLCanvasElement | null;

const registry = new Map<string, CaptureFn>();

/** Registra la captura de un lienzo 3D concreto (pane A o B). */
export function registerCapture(id: string, fn: CaptureFn): () => void {
  registry.set(id, fn);
  return () => {
    if (registry.get(id) === fn) registry.delete(id);
  };
}

/**
 * Captura el lienzo registrado. `scale` es el multiplicador del pixel ratio
 * (2 = alta resolución) y `background` permite exportar sobre fondo blanco.
 */
export function captureCanvas(
  id: string,
  scale = 2,
  background: CaptureBackground = "dark",
): HTMLCanvasElement | null {
  const fn = registry.get(id);
  if (!fn) return null;
  try {
    return fn(Math.min(Math.max(scale, 1), 3), background);
  } catch {
    return null;
  }
}
