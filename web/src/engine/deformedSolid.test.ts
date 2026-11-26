import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import { buildDeformedFrame, interpolateLinearVectors, isTrussFrame } from "./deformation";
import {
  BOX_FACES,
  buildDeformedSolidFrame,
  frameSectionHalfExtents,
  interpolateScalarSeries,
} from "./deformedSolid";
import { buildFrameDiagram, FORCE_COMPONENTS, FORCE_LABELS } from "./diagrams";
import { deformationHeatRange } from "./deformation";
import { allFixtures, loadFixture } from "./testUtils";

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

function dot(a: number[], b: number[]): number {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}

describe("interpolación lineal", () => {
  it("reproduce los valores en las estaciones y es lineal entre ellas", () => {
    const values = interpolateLinearVectors(
      [0, 1],
      [
        [0, 0, 0],
        [2, 4, -6],
      ],
      [0, 0.25, 1],
    );
    expect(values).toEqual([
      [0, 0, 0],
      [0.5, 1, -1.5],
      [2, 4, -6],
    ]);
    expect(interpolateScalarSeries([0, 0.5, 1], [1, 3, 1], [0.25, 0.75])).toEqual([2, 2]);
  });
});

describe("giros de la deformada", () => {
  it("expone rx, ry, rz globales finitos en todas las curvas", () => {
    for (const fixture of ["cantilever_beam.json", "space_frame.json", "space_truss.json"]) {
      const { model } = loadFixture(fixture);
      const result = firstResult(model);
      for (const frameId of model.frameOrder) {
        if (!result.frameResults[frameId]) continue;
        const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 4 });
        expect(curve.globalRotations).toHaveLength(curve.stations.length);
        for (const key of ["rx", "ry", "rz"] as const) {
          expect(curve.heat[key]).toHaveLength(curve.stations.length);
          expect(curve.heat[key].every(Number.isFinite)).toBe(true);
        }
      }
      for (const key of ["rx", "ry", "rz"] as const) {
        const range = deformationHeatRange(model, result, key);
        expect(Number.isFinite(range.min) && Number.isFinite(range.max)).toBe(true);
      }
    }
  });

  it("el voladizo gira en el extremo libre", () => {
    const { model } = loadFixture("cantilever_beam.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[model.frameOrder.length - 1] ?? "";
    const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 4 });
    const tip = curve.globalRotations[curve.globalRotations.length - 1] ?? [0, 0, 0];
    expect(Math.hypot(...tip)).toBeGreaterThan(0);
  });
});

describe("sólido deformado", () => {
  it("con factor 0 coincide con la caja indeformada y con factor 1 aplica u + θ × r", () => {
    const { model } = loadFixture("cantilever_beam.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[model.frameOrder.length - 1] ?? "";
    const frame = model.frames[frameId]!;
    const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 4 });
    const { halfY, halfZ } = frameSectionHalfExtents(model, frame, 1, 1e-6);
    const solid = buildDeformedSolidFrame(curve, frame, halfY, halfZ);

    const segments = curve.stations.length - 1;
    expect(solid.base.length).toBe(segments * BOX_FACES.length * 3 * 3);
    expect(solid.displacement.length).toBe(solid.base.length);
    expect(solid.stationIndex.length).toBe(solid.base.length / 3);

    // Cada vértice base está a la distancia de la sección del eje indeformado.
    const radius = Math.hypot(halfY, halfZ);
    for (let vertex = 0; vertex < solid.stationIndex.length; vertex += 1) {
      const station = solid.stationIndex[vertex] ?? 0;
      const axisPoint = curve.undeformedPoints[station] ?? [0, 0, 0];
      const point = solid.base.slice(vertex * 3, vertex * 3 + 3);
      const r = point.map((value, index) => value - (axisPoint[index] ?? 0));
      expect(Math.hypot(...r)).toBeCloseTo(radius, 9);
      expect(Math.abs(dot(r, frame.localAxes.x))).toBeLessThan(1e-9);

      // El desplazamiento es u + θ × r.
      const u = curve.globalDisplacements[station] ?? [0, 0, 0];
      const t = curve.globalRotations[station] ?? [0, 0, 0];
      const expected = [
        u[0] + t[1] * (r[2] ?? 0) - t[2] * (r[1] ?? 0),
        u[1] + t[2] * (r[0] ?? 0) - t[0] * (r[2] ?? 0),
        u[2] + t[0] * (r[1] ?? 0) - t[1] * (r[0] ?? 0),
      ];
      const actual = solid.displacement.slice(vertex * 3, vertex * 3 + 3);
      expected.forEach((value, index) => {
        expect(actual[index] ?? 0).toBeCloseTo(value, 12);
      });
    }
  });

  it("construye geometría finita en todos los fixtures", () => {
    for (const { file, model } of allFixtures()) {
      const resultId = model.resultOrder[0];
      const result = resultId ? model.results[resultId] : undefined;
      if (!result) continue;
      const frameId = model.frameOrder.find((id) => result.frameResults[id]);
      if (!frameId) continue;
      const frame = model.frames[frameId]!;
      const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 4 });
      const { halfY, halfZ } = frameSectionHalfExtents(model, frame, 1, 1e-6);
      const solid = buildDeformedSolidFrame(curve, frame, halfY, halfZ);
      expect(solid.base.every(Number.isFinite), file).toBe(true);
      expect(solid.displacement.every(Number.isFinite), file).toBe(true);
      if (isTrussFrame(model, frame)) {
        expect(curve.globalRotations.every((r) => r.every(Number.isFinite)), file).toBe(true);
      }
    }
  });
});

describe("acciones internas", () => {
  it("se nombran N, Vy, Vz, T, My, Mz", () => {
    expect(FORCE_COMPONENTS.map((component) => FORCE_LABELS[component])).toEqual([
      "N",
      "Vy",
      "Vz",
      "T",
      "My",
      "Mz",
    ]);
  });

  it("todas las ordenadas, incluidas N y T, son perpendiculares a la barra", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    for (const frameId of model.frameOrder) {
      if (!result.frameResults[frameId]) continue;
      const frame = model.frames[frameId]!;
      for (const component of FORCE_COMPONENTS) {
        const diagram = buildFrameDiagram(model, result, frameId, component);
        expect(Math.abs(dot(diagram.axisVector, frame.localAxes.x))).toBeLessThan(1e-9);
      }
    }
  });
});
