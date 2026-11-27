import { describe, expect, it } from "vitest";
import type { FrameData, PymasModel } from "../types/pymas";
import { loadFixture } from "./testUtils";
import {
  EMPTY_VISIBILITY,
  classifyFrame,
  coordinateLevels,
  filterModel,
  visibleFrameIds,
  visibleModel,
  type VisibilityFilter,
} from "./visibility";

/** Pórtico de un vano: dos columnas (Z), una viga y una diagonal. */
function portalModel(): PymasModel {
  const base = loadFixture("F3_analisis_reparacion.json").model;
  const template = base.frames[base.frameOrder[0]!]!;
  const nodes: PymasModel["nodes"] = {
    a: { id: "a", name: "a", x: 0, y: 0, z: 0 },
    b: { id: "b", name: "b", x: 4, y: 0, z: 0 },
    c: { id: "c", name: "c", x: 0, y: 0, z: 3 },
    d: { id: "d", name: "d", x: 4, y: 0, z: 3.0000001 },
  };
  const frame = (id: string, nodeI: string, nodeJ: string, sectionId: string): FrameData => ({
    ...template,
    id,
    name: id,
    nodeI,
    nodeJ,
    sectionId,
    materialId: "m1",
  });
  const frames = {
    c1: frame("c1", "a", "c", "col"),
    c2: frame("c2", "b", "d", "col"),
    v1: frame("v1", "c", "d", "vig"),
    d1: frame("d1", "a", "d", "dia"),
  };
  return {
    ...base,
    nodes,
    nodeOrder: Object.keys(nodes),
    frames,
    frameOrder: Object.keys(frames),
    supports: {
      sa: { ...Object.values(base.supports)[0]!, id: "sa", node: "a" },
      sb: { ...Object.values(base.supports)[0]!, id: "sb", node: "b" },
    },
  };
}

const filter = (patch: Partial<VisibilityFilter>): VisibilityFilter => ({
  ...EMPTY_VISIBILITY,
  ...patch,
});

describe("visibilidad de barras", () => {
  const model = portalModel();

  it("clasifica columnas, vigas y diagonales según el eje vertical", () => {
    const kinds = model.frameOrder.map((id) => classifyFrame(model, model.frames[id]!, "z"));
    expect(kinds).toEqual(["column", "column", "beam", "brace"]);
    // Con Y vertical todas quedan en el plano horizontal XZ.
    expect(classifyFrame(model, model.frames.c1!, "y")).toBe("beam");
  });

  it("agrupa coordenadas casi iguales en un mismo nivel", () => {
    expect(coordinateLevels(model, "z")).toEqual([0, 3]);
    expect(coordinateLevels(model, "y")).toEqual([0]);
  });

  it("combina filtros por id, sección, tipo y rango", () => {
    const ids = (f: VisibilityFilter) => [...visibleFrameIds(model, f, "z")].sort();
    expect(ids(filter({ hiddenFrames: ["c1"] }))).toEqual(["c2", "d1", "v1"]);
    expect(ids(filter({ hiddenSections: ["col"] }))).toEqual(["d1", "v1"]);
    expect(ids(filter({ hiddenKinds: ["column", "brace"] }))).toEqual(["v1"]);
    expect(ids(filter({ range: { axis: "z", min: 3, max: 3 } }))).toEqual(["v1"]);
    expect(ids(filter({ range: { axis: "x", min: 0, max: 0 } }))).toEqual(["c1"]);
    expect(ids(filter({ hiddenMaterials: ["m1"] }))).toEqual([]);
  });

  it("conserva nudos compartidos y elimina apoyos de nudos ocultos", () => {
    const view = filterModel(model, new Set(["v1", "c2"]));
    expect(view.frameOrder).toEqual(["c2", "v1"]);
    expect(view.nodeOrder).toEqual(["b", "c", "d"]);
    expect(Object.keys(view.supports)).toEqual(["sb"]);
    expect(view.frames.c1).toBeUndefined();
  });

  it("sin filtro devuelve el mismo modelo y cachea la vista", () => {
    expect(visibleModel(model, EMPTY_VISIBILITY, "z")).toBe(model);
    const f = filter({ hiddenFrames: ["d1"] });
    expect(visibleModel(model, f, "z")).toBe(visibleModel(model, f, "z"));
  });
});
