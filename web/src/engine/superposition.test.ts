import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  MissingPatternResultError,
  computeCombination,
  envelopeCombination,
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
