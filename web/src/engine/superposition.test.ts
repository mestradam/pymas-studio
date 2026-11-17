import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  MissingPatternResultError,
  computeCombination,
  computeLinearCombinations,
  envelopeAcrossCombinations,
  envelopeCombination,
  envelopeResults,
  hasStoredResult,
  linearCombination,
} from "./superposition";
import { allFixtures, closeTo, loadFixture } from "./testUtils";

function expectResultClose(
  actual: PatternResultData,
  expected: PatternResultData,
  model: PymasModel,
  tolerance = 1e-9,
): void {
  for (const nodeId of model.nodeOrder) {
    const aDisp = actual.nodalDisplacements[nodeId];
    const eDisp = expected.nodalDisplacements[nodeId];
    if (eDisp) {
      expect(aDisp).toBeDefined();
      for (const key of Object.keys(eDisp) as Array<keyof typeof eDisp>) {
        expect(closeTo(aDisp?.[key] ?? 0, eDisp[key], tolerance, tolerance)).toBe(true);
      }
    }
    const aReaction = actual.reactions[nodeId];
    const eReaction = expected.reactions[nodeId];
    if (eReaction) {
      expect(aReaction).toBeDefined();
      for (const key of Object.keys(eReaction) as Array<keyof typeof eReaction>) {
        expect(
          closeTo(aReaction?.[key] ?? 0, eReaction[key], tolerance, tolerance),
        ).toBe(true);
      }
    }
  }

  for (const frameId of model.frameOrder) {
    const aFrame = actual.frameResults[frameId];
    const eFrame = expected.frameResults[frameId];
    if (!eFrame) continue;
    expect(aFrame).toBeDefined();
    if (!aFrame) continue;
    for (const key of Object.keys(eFrame.endActions.i) as Array<
      keyof typeof eFrame.endActions.i
    >) {
      expect(
        closeTo(aFrame.endActions.i[key], eFrame.endActions.i[key], tolerance, tolerance),
      ).toBe(true);
      expect(
        closeTo(aFrame.endActions.j[key], eFrame.endActions.j[key], tolerance, tolerance),
      ).toBe(true);
    }
    expect(aFrame.internalForces.stations).toEqual(eFrame.internalForces.stations);
    expect(aFrame.internalDisplacements.stations).toEqual(
      eFrame.internalDisplacements.stations,
    );
    for (const key of ["fx", "fy", "fz", "mx", "my", "mz"] as const) {
      expect(aFrame.internalForces[key]).toHaveLength(eFrame.internalForces[key].length);
      for (let i = 0; i < eFrame.internalForces[key].length; i += 1) {
        expect(
          closeTo(
            aFrame.internalForces[key][i] ?? 0,
            eFrame.internalForces[key][i] ?? 0,
            tolerance,
            tolerance,
          ),
        ).toBe(true);
      }
    }
    for (const key of ["ux", "uy", "uz", "rx", "ry", "rz"] as const) {
      expect(aFrame.internalDisplacements[key]).toHaveLength(
        eFrame.internalDisplacements[key].length,
      );
      for (let i = 0; i < eFrame.internalDisplacements[key].length; i += 1) {
        expect(
          closeTo(
            aFrame.internalDisplacements[key][i] ?? 0,
            eFrame.internalDisplacements[key][i] ?? 0,
            tolerance,
            tolerance,
          ),
        ).toBe(true);
      }
    }
  }
}

describe("superposition · combinación lineal", () => {
  for (const fixture of allFixtures()) {
    it(`${fixture.file}: un factor 1.0 reproduce el resultado del patrón`, () => {
      const { model } = fixture;
      for (const patternId of model.loadPatternOrder) {
        const stored = model.results[patternId];
        if (!stored) continue;
        const combined = linearCombination(model, { [patternId]: 1 });
        expectResultClose(combined, stored, model, 1e-9);
      }
    });
  }

  it("F3: las 17 combinaciones precalculadas coinciden con la superposición en vivo", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    for (const combination of Object.values(model.loadCombinations)) {
      const stored = model.results[combination.id];
      expect(stored).toBeDefined();
      if (!stored) continue;
      const computed = computeCombination(model, combination.id);
      expect("nodalDisplacements" in computed).toBe(true);
      if ("nodalDisplacements" in computed) {
        expectResultClose(computed, stored, model, 1e-9);
      }
    }
  });

  it("lanza un error claro si falta el resultado de un patrón", () => {
    const { model } = loadFixture("simple_beam.json");
    expect(() => linearCombination(model, { no_existe: 1 })).toThrow(
      MissingPatternResultError,
    );
    const tolerant = linearCombination(model, { no_existe: 1 }, { allowMissing: true });
    expect(tolerant.frameResults[model.frameOrder[0] ?? ""]).toBeDefined();
  });

  it("detecta resultados precalculados presentes", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    expect(hasStoredResult(model, "1.4D")).toBe(true);
    expect(hasStoredResult(model, "no_existe")).toBe(false);
  });
});

describe("superposition · envolvente", () => {
  it("F3: min ≤ max en nudos, reacciones y estaciones", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const envelope = envelopeCombination(model, { D: 1.2, Lr: 1.6 });
    for (const nodeId of model.nodeOrder) {
      const minDisp = envelope.min.nodalDisplacements[nodeId];
      const maxDisp = envelope.max.nodalDisplacements[nodeId];
      expect(minDisp).toBeDefined();
      expect(maxDisp).toBeDefined();
      if (!minDisp || !maxDisp) continue;
      for (const key of Object.keys(minDisp) as Array<keyof typeof minDisp>) {
        expect(minDisp[key]).toBeLessThanOrEqual(maxDisp[key] + 1e-12);
      }
      const minReaction = envelope.min.reactions[nodeId];
      const maxReaction = envelope.max.reactions[nodeId];
      if (!minReaction || !maxReaction) continue;
      for (const key of Object.keys(minReaction) as Array<keyof typeof minReaction>) {
        expect(minReaction[key]).toBeLessThanOrEqual(maxReaction[key] + 1e-12);
      }
    }
  });

  it("F3: la envolvente de D/Lr coincide con el máximo/mínimo de los patrones escalados", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const envelope = envelopeCombination(model, { D: 1.2, Lr: 1.6 });
    for (const frameId of model.frameOrder.slice(0, 10)) {
      const minFrame = envelope.min.frameResults[frameId];
      const maxFrame = envelope.max.frameResults[frameId];
      expect(minFrame).toBeDefined();
      expect(maxFrame).toBeDefined();
      if (!minFrame || !maxFrame) continue;
      for (let i = 0; i < minFrame.internalForces.mz.length; i += 1) {
        expect(minFrame.internalForces.mz[i]).toBeLessThanOrEqual(
          (maxFrame.internalForces.mz[i] ?? 0) + 1e-9,
        );
      }
    }
  });
});

describe("superposition · combinaciones y envolventes en vivo", () => {
  it("F3: calcula todas las combinaciones sin usar resultados precalculados", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const stored = model.results;
    const withoutCombinations: PymasModel = {
      ...model,
      results: Object.fromEntries(
        Object.entries(stored).filter(([resultId]) => !model.loadCombinations[resultId]),
      ),
    };

    expect(Object.keys(withoutCombinations.results)).not.toContain("1.4D");
    const computed = computeLinearCombinations(
      withoutCombinations,
      model.loadCombinationOrder,
    );
    expect(Object.keys(computed)).toHaveLength(model.loadCombinationOrder.length);

    for (const combination of Object.values(model.loadCombinations)) {
      const live = computed[combination.id];
      const expected = stored[combination.id];
      expect(live).toBeDefined();
      expect(expected).toBeDefined();
      if (live && expected) {
        expectResultClose(live, expected, model, 1e-9);
      }
    }
  });

  it("F3: ENV_MAX y ENV_MIN sobre las combinaciones activas coinciden con sus extremos exactos", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const activeIds = model.loadCombinationOrder;
    const combinations = computeLinearCombinations(model, activeIds);
    const envelope = envelopeAcrossCombinations(model, activeIds);
    const combinationResults = activeIds
      .map((id) => combinations[id])
      .filter((result): result is PatternResultData => result !== undefined);

    expect(combinationResults).toHaveLength(activeIds.length);

    for (const nodeId of model.nodeOrder) {
      for (const key of ["ux", "uy", "uz", "rx", "ry", "rz"] as const) {
        const values = combinationResults.map(
          (result) => result.nodalDisplacements[nodeId]?.[key] ?? 0,
        );
        expect(envelope.min.nodalDisplacements[nodeId]?.[key]).toBeCloseTo(
          Math.min(...values),
          9,
        );
        expect(envelope.max.nodalDisplacements[nodeId]?.[key]).toBeCloseTo(
          Math.max(...values),
          9,
        );
      }
      for (const key of ["fx", "fy", "fz", "mx", "my", "mz"] as const) {
        const values = combinationResults.map(
          (result) => result.reactions[nodeId]?.[key] ?? 0,
        );
        expect(envelope.min.reactions[nodeId]?.[key]).toBeCloseTo(
          Math.min(...values),
          9,
        );
        expect(envelope.max.reactions[nodeId]?.[key]).toBeCloseTo(
          Math.max(...values),
          9,
        );
      }
    }

    for (const frameId of model.frameOrder) {
      const minFrame = envelope.min.frameResults[frameId];
      const maxFrame = envelope.max.frameResults[frameId];
      expect(minFrame).toBeDefined();
      expect(maxFrame).toBeDefined();
      if (!minFrame || !maxFrame) continue;

      for (const key of ["fx", "fy", "fz", "mx", "my", "mz"] as const) {
        for (let index = 0; index < minFrame.internalForces.stations.length; index += 1) {
          const values = combinationResults.map(
            (result) =>
              result.frameResults[frameId]?.internalForces[key][index] ?? 0,
          );
          expect(minFrame.internalForces[key][index]).toBeCloseTo(
            Math.min(...values),
            9,
          );
          expect(maxFrame.internalForces[key][index]).toBeCloseTo(
            Math.max(...values),
            9,
          );
        }
      }
      for (const key of ["ux", "uy", "uz", "rx", "ry", "rz"] as const) {
        for (let index = 0; index < minFrame.internalDisplacements.stations.length; index += 1) {
          const values = combinationResults.map(
            (result) =>
              result.frameResults[frameId]?.internalDisplacements[key][index] ?? 0,
          );
          expect(minFrame.internalDisplacements[key][index]).toBeCloseTo(
            Math.min(...values),
            9,
          );
          expect(maxFrame.internalDisplacements[key][index]).toBeCloseTo(
            Math.max(...values),
            9,
          );
        }
      }
    }
  });

  it("envolvente de un subconjunto activo sólo considera esas combinaciones", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const activeIds = model.loadCombinationOrder.slice(0, 3);
    const combinations = computeLinearCombinations(model, activeIds);
    const envelope = envelopeAcrossCombinations(model, activeIds);
    const frameId = model.frameOrder[0] ?? "";
    const frame = envelope.max.frameResults[frameId];
    expect(frame).toBeDefined();
    if (!frame) return;

    for (let index = 0; index < frame.internalForces.mz.length; index += 1) {
      const values = activeIds.map(
        (id) => combinations[id]?.frameResults[frameId]?.internalForces.mz[index] ?? 0,
      );
      expect(frame.internalForces.mz[index]).toBeCloseTo(Math.max(...values), 9);
    }
  });

  it("envolvente vacía devuelve ceros y envelopeResults respeta todos los componentes", () => {
    const { model } = loadFixture("simple_beam.json");
    const empty = envelopeAcrossCombinations(model, []);
    const frameId = model.frameOrder[0] ?? "";
    expect(empty.min.frameResults[frameId]?.internalForces.mz.every((value) => value === 0)).toBe(true);
    expect(empty.max.reactions[model.nodeOrder[0] ?? ""]?.fx).toBe(0);

    const first = linearCombination(model, { default: 1 });
    const doubled = linearCombination(model, { default: 2 });
    const envelope = envelopeResults(model, [first, doubled]);
    for (let index = 0; index < first.frameResults[frameId]!.internalForces.mz.length; index += 1) {
      const a = first.frameResults[frameId]?.internalForces.mz[index] ?? 0;
      const b = doubled.frameResults[frameId]?.internalForces.mz[index] ?? 0;
      expect(envelope.min.frameResults[frameId]?.internalForces.mz[index]).toBeCloseTo(
        Math.min(a, b),
        12,
      );
      expect(envelope.max.frameResults[frameId]?.internalForces.mz[index]).toBeCloseTo(
        Math.max(a, b),
        12,
      );
    }
  });
});
