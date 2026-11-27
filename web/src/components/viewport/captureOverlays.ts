/**
 * Etiquetas HTML del visor dentro del PNG exportado.
 *
 * Las etiquetas de drei `<Html>` (valores extremos de los diagramas,
 * reacciones, nombre de la barra seleccionada…) son elementos DOM que flotan
 * sobre el canvas WebGL y no aparecen en `gl.render`. Aquí se redibujan en el
 * canvas de salida en la misma posición y con el mismo estilo calculado
 * (fondo, borde, color y fuente), escaladas a la resolución de la captura.
 */

function parsedAlpha(color: string): number {
  if (!color || color === "transparent") return 0;
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return 1;
  const parts = match[1]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return 1;
  const alpha = parts[3]!;
  return alpha.endsWith("%") ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
}

function isHidden(style: CSSStyleDeclaration): boolean {
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity || "1") <= 0.01
  );
}

function drawElementBox(
  context: CanvasRenderingContext2D,
  rect: DOMRect,
  style: CSSStyleDeclaration,
  origin: DOMRect,
  scale: number,
): void {
  const x = (rect.left - origin.left) * scale;
  const y = (rect.top - origin.top) * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;
  const radius = Math.min(
    Number.parseFloat(style.borderTopLeftRadius || "0") * scale,
    width / 2,
    height / 2,
  );

  if (parsedAlpha(style.backgroundColor) > 0) {
    context.fillStyle = style.backgroundColor;
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
  }
  const borderWidth = Number.parseFloat(style.borderTopWidth || "0");
  if (borderWidth > 0 && parsedAlpha(style.borderTopColor) > 0) {
    context.strokeStyle = style.borderTopColor;
    context.lineWidth = borderWidth * scale;
    context.beginPath();
    context.roundRect(
      x + (borderWidth * scale) / 2,
      y + (borderWidth * scale) / 2,
      width - borderWidth * scale,
      height - borderWidth * scale,
      radius,
    );
    context.stroke();
  }
}

function drawTextNode(
  context: CanvasRenderingContext2D,
  node: Text,
  style: CSSStyleDeclaration,
  origin: DOMRect,
  scale: number,
): void {
  const text = node.textContent?.replace(/\s+/g, " ").trim();
  if (!text) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  range.detach();
  if (rect.width <= 0 || rect.height <= 0) return;

  const fontSize = Number.parseFloat(style.fontSize || "10") * scale;
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText(
    text,
    (rect.left - origin.left) * scale,
    (rect.top - origin.top + rect.height / 2) * scale,
  );
}

/**
 * Dibuja en `context` las etiquetas HTML que drei coloca junto a `canvas`.
 * `scale` es la relación píxeles de salida / píxeles CSS del visor.
 */
export function drawHtmlOverlays(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scale: number,
): void {
  // R3F envuelve el canvas en un div; drei monta las etiquetas como hermanos
  // de ese div, dentro del contenedor del <Canvas> (su fuente de eventos).
  const holder = canvas.parentElement;
  const container = holder?.parentElement;
  if (!holder || !container) return;
  const origin = canvas.getBoundingClientRect();
  if (origin.width <= 0 || origin.height <= 0) return;

  context.save();
  for (const wrapper of Array.from(container.children)) {
    if (wrapper === holder || !(wrapper instanceof HTMLElement)) continue;
    const elements = [wrapper, ...Array.from(wrapper.querySelectorAll<HTMLElement>("*"))];
    for (const element of elements) {
      const style = window.getComputedStyle(element);
      if (isHidden(style)) continue;
      const rect = element.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.right < origin.left ||
        rect.left > origin.right ||
        rect.bottom < origin.top ||
        rect.top > origin.bottom
      ) {
        continue;
      }
      drawElementBox(context, rect, style, origin, scale);
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          drawTextNode(context, child as Text, style, origin, scale);
        }
      }
    }
  }
  context.restore();
}
