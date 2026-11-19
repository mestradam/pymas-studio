import * as THREE from "three";
import type { CaptureBackground } from "./captureRegistry";

/**
 * Paleta de captura para informes.
 *
 * La exportación sobre fondo oscuro se mantiene tal cual. Cuando se exporta
 * sobre blanco se oscurecen y saturan temporalmente los colores de la escena
 * (materiales, colores por vértice e instancias) y se atenúa la cuadrícula para
 * que los diagramas y vectores destaquen sin competir con el fondo.
 */

interface MaterialSnapshot {
  material: THREE.Material;
  color?: THREE.Color;
  emissive?: THREE.Color;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  vertexColors?: boolean;
  isGrid?: boolean;
}

interface AttributeSnapshot {
  attribute: THREE.BufferAttribute;
  data: Float32Array;
}

type ColorMaterial = THREE.Material & { color: THREE.Color };
type EmissiveMaterial = THREE.Material & {
  emissive: THREE.Color;
  emissiveIntensity?: number;
};
type VertexColorMaterial = THREE.Material & { vertexColors: boolean };

function hasColor(material: THREE.Material): material is ColorMaterial {
  return (
    "color" in material &&
    (material as { color?: unknown }).color instanceof THREE.Color
  );
}

function hasEmissive(material: THREE.Material): material is EmissiveMaterial {
  return (
    "emissive" in material &&
    (material as { emissive?: unknown }).emissive instanceof THREE.Color
  );
}

function hasVertexColors(
  material: THREE.Material,
): material is VertexColorMaterial {
  return "vertexColors" in material;
}

const hsl = { h: 0, s: 0, l: 0 };

type PaletteMode = "darken" | "brighten";

/**
 * Sobre blanco oscurece y satura; sobre negro claro (cuando la interfaz está
 * en tema claro) recupera luminosidad para que los vectores sigan visibles.
 */
function printColor(color: THREE.Color, mode: PaletteMode): THREE.Color {
  const out = color.clone();
  out.getHSL(hsl);
  const neutral = hsl.s < 0.1;
  if (mode === "darken") {
    out.setHSL(
      hsl.h,
      neutral ? hsl.s : Math.min(1, Math.max(hsl.s, 0.72)),
      Math.min(hsl.l, neutral ? 0.42 : 0.4),
    );
  } else {
    out.setHSL(
      hsl.h,
      neutral ? hsl.s : Math.min(1, Math.max(hsl.s, 0.62)),
      neutral ? Math.max(hsl.l, 0.7) : Math.max(hsl.l, 0.56),
    );
  }
  return out;
}

function transformTriples(
  array: Float32Array,
  color: THREE.Color,
  mode: PaletteMode,
): void {
  for (let index = 0; index + 2 < array.length; index += 3) {
    color.setRGB(
      array[index] ?? 0,
      array[index + 1] ?? 0,
      array[index + 2] ?? 0,
    );
    const output = printColor(color, mode);
    array[index] = output.r;
    array[index + 1] = output.g;
    array[index + 2] = output.b;
  }
}

/** Aplica la paleta de captura y devuelve la función que restaura la escena. */
export function applyCapturePalette(
  scene: THREE.Scene,
  background: CaptureBackground,
  brightenDark = false,
): () => void {
  const mode: PaletteMode =
    background === "white" ? "darken" : "brighten";
  if (background !== "white" && !brightenDark) return () => {};

  const materials: MaterialSnapshot[] = [];
  const attributes: AttributeSnapshot[] = [];
  const scratch = new THREE.Color();
  const seenMaterials = new Set<string>();

  const rememberMaterial = (material: THREE.Material) => {
    if (seenMaterials.has(material.uuid)) return false;
    seenMaterials.add(material.uuid);
    return true;
  };

  scene.traverse((object) => {
    const renderable = object as THREE.Mesh;
    const geometry = renderable.geometry as THREE.BufferGeometry | undefined;
    const materialValue = renderable.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (!materialValue) return;

    const materialList = Array.isArray(materialValue)
      ? materialValue
      : [materialValue];

    for (const material of materialList) {
      if (!rememberMaterial(material)) continue;

      const snapshot: MaterialSnapshot = {
        material,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      };

      // La cuadrícula se vuelve un gris muy suave y translúcido.
      if (object.type === "GridHelper") {
        // En capturas oscuras la cuadrícula se deja tal cual.
        if (mode !== "darken") continue;
        snapshot.isGrid = true;
        if (hasColor(material)) snapshot.color = material.color.clone();
        if (hasVertexColors(material)) {
          snapshot.vertexColors = material.vertexColors;
          material.vertexColors = false;
        }
        materials.push(snapshot);
        if (hasColor(material)) material.color.set("#cbd5e1");
        material.transparent = true;
        material.opacity = 0.26;
        material.depthWrite = false;
        continue;
      }

      const instanceColor =
        (object as THREE.InstancedMesh).isInstancedMesh === true
          ? (object as THREE.InstancedMesh).instanceColor
          : null;
      const vertexColorAttribute =
        hasVertexColors(material) && material.vertexColors && geometry
          ? (geometry.getAttribute("color") as THREE.BufferAttribute | undefined)
          : undefined;
      const usesOwnColors = Boolean(instanceColor || vertexColorAttribute);

      if (hasColor(material) && !usesOwnColors) {
        snapshot.color = material.color.clone();
        material.color.copy(printColor(material.color, mode));
      }
      if (hasEmissive(material) && material.emissive.getHex() !== 0) {
        snapshot.emissive = material.emissive.clone();
        material.emissive.copy(printColor(material.emissive, mode));
      }

      if (mode === "darken" && material.transparent && material.opacity < 0.99) {
        material.opacity = Math.min(1, material.opacity * 1.35);
      }

      materials.push(snapshot);

      if (vertexColorAttribute) {
        const data = (vertexColorAttribute.array as Float32Array).slice();
        transformTriples(
          vertexColorAttribute.array as Float32Array,
          scratch,
          mode,
        );
        vertexColorAttribute.needsUpdate = true;
        attributes.push({ attribute: vertexColorAttribute, data });
      }

      if (instanceColor) {
        const data = (instanceColor.array as Float32Array).slice();
        transformTriples(instanceColor.array as Float32Array, scratch, mode);
        instanceColor.needsUpdate = true;
        attributes.push({ attribute: instanceColor, data });
      }
    }
  });

  return () => {
    for (const snapshot of materials) {
      const { material } = snapshot;
      if (snapshot.color && hasColor(material)) {
        material.color.copy(snapshot.color);
      }
      if (snapshot.emissive && hasEmissive(material)) {
        material.emissive.copy(snapshot.emissive);
      }
      material.opacity = snapshot.opacity;
      material.transparent = snapshot.transparent;
      material.depthWrite = snapshot.depthWrite;
      if (
        snapshot.isGrid &&
        snapshot.vertexColors !== undefined &&
        hasVertexColors(material)
      ) {
        material.vertexColors = snapshot.vertexColors;
      }
      material.needsUpdate = true;
    }
    for (const snapshot of attributes) {
      (snapshot.attribute.array as Float32Array).set(snapshot.data);
      snapshot.attribute.needsUpdate = true;
    }
  };
}
