import { describe, expect, it } from "vitest";
import {
  computeAppliedLoads,
  computeCombinationEquilibrium,
  computeEquilibrium,
  sumResultReactions,
} from "./equilibrium";
import { computeLinearCombinations } from "./superposition";
import { allFixtures, closeTo, loadFixture } from "./testUtils";

describe("equilibrium · balance global de todos los fixtures", () => {
  for (const fixture of allFixtures()) {
    it(`${fixture.file}: ΣF y ΣM se anulan para cada patrón`, () => {
      const { model } = fixture;
      for (const patternId of model.loadPatternOrder) {
        const summary = computeEquilibrium(model, patternId);
        for (const value of [
          ...summary.applied.force,
          ...summary.applied.moment,
          ...summary.reactions.force,
          ...summary.reactions.moment,
          ...summary.residual.force,
          ...summary.residual.moment,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(summary.relativeForceResidual).toBeLessThanOrEqual(0.002);
        expect(summary.relativeMomentResidual).toBeLessThanOrEqual(0.003);
        expect(summary.balanced).toBe(true);
        expect(summary.reactionForceNorm).toBeGreaterThan(0);
      }
    });
  }

  it("simple_beam: 120 kN aplicados hacia -Y y reacción +Y", () => {
    const { model } = loadFixture("simple_beam.json");
    const summary = computeEquilibrium(model, "default");
    expect(closeTo(summary.applied.force[1], -120, 1e-9, 1e-12)).toBe(true);
    expect(closeTo(summary.reactions.force[1], 120, 1e-9, 1e-12)).toBe(true);
    expect(summary.residualForceNorm).toBeLessThan(1e-9);
  });

  it("space_truss: la suma de cargas nodales es (11, 10, -28)", () => {
    const { model } = loadFixture("space_truss.json");
    const pattern = model.loadPatterns["point loads"];
    expect(pattern).toBeDefined();
    if (!pattern) return;
    const applied = computeAppliedLoads(model, pattern);
    expect(closeTo(applied.force[0], 11, 1e-9, 1e-12)).toBe(true);
    expect(closeTo(applied.force[1], 10, 1e-9, 1e-12)).toBe(true);
    expect(closeTo(applied.force[2], -28, 1e-9, 1e-12)).toBe(true);
    expect(applied.distributedForce.every((value) => value === 0)).toBe(true);
  });

  it("F3: las cargas distribuidas son locales y el patrón D sólo difiere por redondeo", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const summary = computeEquilibrium(model, "D");
    expect(summary.appliedForceNorm).toBeGreaterThan(1000);
    expect(summary.relativeForceResidual).toBeLessThan(0.001);
    expect(summary.residualForceNorm).toBeLessThan(1);
    // Si se trataran las cargas de barra como globales, el residuo superaría
    // los 300 kN. Este test protege la convención local de pymas.
    expect(summary.residualForceNorm).toBeLessThan(10);
  });

  it("F3: las combinaciones lineales también quedan en equilibrio", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    for (const combination of Object.values(model.loadCombinations)) {
      const summary = computeCombinationEquilibrium(model, combination);
      expect(summary.balanced).toBe(true);
      expect(summary.relativeForceResidual).toBeLessThanOrEqual(0.002);
      expect(summary.relativeMomentResidual).toBeLessThanOrEqual(0.003);
    }
  });

  it("la suma global de reacciones coincide con el balance y expone ΣFx, ΣFy, ΣFz", () => {
    for (const fixture of allFixtures()) {
      const { model } = fixture;
      for (const patternId of model.loadPatternOrder) {
        const result = model.results[patternId];
        if (!result) continue;
        const sum = sumResultReactions(model, result);
        const summary = computeEquilibrium(model, patternId, result);
        for (let index = 0; index < 3; index += 1) {
          expect(
            closeTo(sum.force[index] ?? 0, summary.reactions.force[index] ?? 0, 1e-9, 1e-9),
          ).toBe(true);
          expect(
            closeTo(sum.moment[index] ?? 0, summary.reactions.moment[index] ?? 0, 1e-9, 1e-9),
          ).toBe(true);
        }
      }
    }
  });

  it("F3: la suma de reacciones de una combinación en vivo coincide con su equilibrio", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const combinations = computeLinearCombinations(model);
    for (const combination of Object.values(model.loadCombinations)) {
      const result = combinations[combination.id];
      if (!result) continue;
      const sum = sumResultReactions(model, result);
      const summary = computeCombinationEquilibrium(model, combination);
      for (let index = 0; index < 3; index += 1) {
        expect(
          closeTo(sum.force[index] ?? 0, summary.reactions.force[index] ?? 0, 1e-9, 1e-9),
        ).toBe(true);
      }
    }
  });
});
