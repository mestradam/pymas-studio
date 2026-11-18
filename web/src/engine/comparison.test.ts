import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  compareValue,
  compareModels,
  demandColor,
  percentChange,
  summarizeBaseReactions,
} from "./comparison";
import { linearCombination } from "./superposition";
import { loadFixture } from "./testUtils";

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

describe("comparador · métricas base", () => {
  it("calcula deltas y porcentajes respecto del valor absoluto de A", () => {
    expect(percentChange(10, 12)).toBeCloseTo(20, 12);
    expect(percentChange(10, 5)).toBeCloseTo(-50, 12);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(Number.NaN, 5)).toBeNull();

    const value = compareValue(4, 5);
    expect(value).toEqual({ a: 4, b: 5, delta: 1, percent: 25 });
  });

  it("resume el cortante, la carga vertical y el momento basal", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const result = firstResult(model);
    const summary = summarizeBaseReactions(result);
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (const reaction of Object.values(result.reactions)) {
      fx += reaction.fx;
      fy += reaction.fy;
      fz += reaction.fz;
    }
    expect(summary.fx).toBeCloseTo(fx, 9);
    expect(summary.fy).toBeCloseTo(fy, 9);
    expect(summary.fz).toBeCloseTo(fz, 9);
    expect(summary.shear).toBeCloseTo(Math.hypot(fx, fy), 9);
    expect(summary.axial).toBeCloseTo(Math.abs(fz), 9);
    expect(summary.moment).toBeGreaterThanOrEqual(0);
  });
});

describe("comparador · modelos A/B", () => {
  it("comparar un modelo consigo mismo produce deltas nulos", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const result = firstResult(model);
    const comparison = compareModels(model, result, model, result);

    expect(comparison.summary.nodeCount).toBeGreaterThan(0);
    expect(comparison.summary.frameCount).toBeGreaterThan(0);
    expect(comparison.summary.reactionCount).toBeGreaterThan(0);
    expect(comparison.nodes).toHaveLength(comparison.summary.nodeCount);
    expect(comparison.frames).toHaveLength(comparison.summary.frameCount);

    for (const node of comparison.nodes) {
      expect(node.delta).toBeCloseTo(0, 12);
      expect(node.percent).toBe(0);
    }
    for (const frame of comparison.frames) {
      expect(frame.maxForce.delta).toBeCloseTo(0, 12);
      expect(frame.maxMoment.delta).toBeCloseTo(0, 12);
    }
    for (const value of [
      comparison.summary.maxDisplacement,
      comparison.summary.baseShear,
      comparison.summary.baseAxial,
      comparison.summary.baseMoment,
      comparison.summary.maxReactionForce,
      comparison.summary.maxFrameForce,
      comparison.summary.maxFrameMoment,
    ]) {
      expect(value.delta).toBeCloseTo(0, 9);
      expect(value.percent).toBe(0);
    }
    expect(comparison.summary.frameIncreaseCount).toBe(0);
    expect(comparison.summary.frameDecreaseCount).toBe(0);
    expect(comparison.summary.frameEqualCount).toBe(comparison.frames.length);
  });

  it("comparar contra el doble de carga produce +100 % en las demandas no nulas", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const resultA = firstResult(model);
    const patternId = model.loadPatternOrder[0];
    expect(patternId).toBeDefined();
    const resultB = linearCombination(model, { [patternId ?? ""]: 2 });
    const comparison = compareModels(model, resultA, model, resultB);

    expect(comparison.summary.baseShear.percent).toBeCloseTo(100, 8);
    expect(comparison.summary.maxDisplacement.percent).toBeCloseTo(100, 8);
    expect(comparison.summary.maxFrameForce.percent).toBeCloseTo(100, 8);
    expect(comparison.summary.frameIncreaseCount).toBeGreaterThan(0);

    for (const node of comparison.nodes) {
      if (Math.abs(node.a) > 1e-9) {
        expect(node.percent).toBeCloseTo(100, 8);
        expect(node.delta).toBeCloseTo(node.a, 10);
      }
    }
  });

  it("tolera modelos con distinta topología", () => {
    const { model: modelA } = loadFixture("space_frame.json");
    const { model: modelB } = loadFixture("simple_beam.json");
    const comparison = compareModels(
      modelA,
      firstResult(modelA),
      modelB,
      firstResult(modelB),
    );
    expect(comparison.summary.nodeCount).toBeGreaterThanOrEqual(0);
    expect(comparison.summary.frameCount).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(comparison.summary.maxDisplacement.a)).toBe(true);
    for (const frame of comparison.frames) {
      expect(Number.isFinite(frame.maxForce.percent ?? 0)).toBe(true);
    }
  });
});

describe("comparador · mapa de calor", () => {
  it("verde para reducción, gris neutro y rojo para aumento", () => {
    expect(demandColor(0)).toBe("#64748b");
    expect(demandColor(null)).toBe("#64748b");
    const increase = demandColor(50);
    const decrease = demandColor(-50);
    expect(increase).toMatch(/^#ef/);
    expect(decrease).toMatch(/^#22/);
    expect(demandColor(10)).not.toBe(increase);
    expect(demandColor(-10)).not.toBe(decrease);
  });
});
