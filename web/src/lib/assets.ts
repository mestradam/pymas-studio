/** Devuelve una URL relativa al documento, compatible con GitHub Pages. */
export function assetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || "./";
  const clean = relativePath.replace(/^\/+/, "");
  return new URL(`${base}${clean}`, document.baseURI).toString();
}

/**
 * Resuelve `?model=...`:
 *  - "simple_beam.json"        -> samples/simple_beam.json
 *  - "samples/simple_beam.json" -> URL relativa al documento
 *  - "./modelo.json"            -> URL relativa al documento
 *  - "https://..."              -> URL absoluta
 */
export function resolveModelParam(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.includes("/")
  ) {
    return new URL(trimmed, document.baseURI).toString();
  }
  return assetUrl(`samples/${trimmed}`);
}

export function fileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url, document.baseURI).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "modelo.json");
  } catch {
    return "modelo.json";
  }
}
