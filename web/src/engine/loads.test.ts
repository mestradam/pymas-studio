import { describe, expect, it } from "vitest";
import { projectLoadToGlobal } from "./geometry";
import { combinePatternLoads } from "./loads";
import { loadFixture } from "./testUtils";

describe("cargas combinadas", () => {
  const { model } = loadFixture("F3_analisis_reparacion.json");

  it("un patrón con factor 1 reproduce sus cargas", () => {
    const patternId = model.loadPatternOrder[0]!;
    const pattern = model.loadPatterns[patternId]!;
    const combined = combinePatternLoads(model, { [patternId]: 1 });

    for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
      expect(combined.nodal[nodeId]?.force).toEqual([load.fx, load.fy, load.fz]);
    }
    for (const [frameId, loads] of Object.entries(pattern.frameLoads)) {
      const frame = model.frames[frameId]!;
      const expected = loads
        .map((load) => projectLoadToGlobal(load, frame.localAxes))
        .reduce<number[]>((sum, value) => sum.map((v, i) => v + (value[i] ?? 0)), [0, 0, 0]);
      const actual = combined.frames[frameId] ?? [0, 0, 0];
      expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 9));
    }
  });

  it("una combinación suma los patrones escalados por sus factores", () => {
    const combinationId = model.loadCombinationOrder[0]!;
    const factors = model.loadCombinations[combinationId]!.factors;
    const combined = combinePatternLoads(model, factors);

    const expected: Record<string, number[]> = {};
    for (const [patternId, factor] of Object.entries(factors)) {
      for (const [frameId, partial] of Object.entries(
        combinePatternLoads(model, { [patternId]: 1 }).frames,
      )) {
        const total = (expected[frameId] ??= [0, 0, 0]);
        partial.forEach((value, index) => (total[index]! += value * factor));
      }
    }
    expect(Object.keys(combined.frames).sort()).toEqual(Object.keys(expected).sort());
    for (const [frameId, total] of Object.entries(expected)) {
      total.forEach((value, index) =>
        expect(combined.frames[frameId]?.[index]).toBeCloseTo(value, 9),
      );
    }
  });

  it("factores nulos o patrones inexistentes no aportan cargas", () => {
    const patternId = model.loadPatternOrder[0]!;
    const empty = combinePatternLoads(model, { [patternId]: 0, inexistente: 2 });
    expect(empty).toEqual({ nodal: {}, frames: {} });
  });
});
