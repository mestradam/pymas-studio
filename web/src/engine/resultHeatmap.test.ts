import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import { deformationHeatRange } from "./deformation";
import {
  FORCE_HEAT_SCALARS,
  isDeformationScalar,
  isForceHeatScalar,
} from "./heatmap";
import {
  frameForceHeatSeries,
  frameHeatStations,
  resultHeatRange,
} from "./resultHeatmap";
import { closeTo, loadFixture } from "./testUtils";

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

describe("mapa de calor · catálogo de resultados", () => {
  it("separa escalares de deformada y de esfuerzos", () => {
    expect(isDeformationScalar("magnitude")).toBe(true);
    expect(isDeformationScalar("drift")).toBe(true);
    expect(isDeformationScalar("mz")).toBe(false);
    expect(isForceHeatScalar("mz")).toBe(true);
    expect(isForceHeatScalar("ux")).toBe(false);
    expect(FORCE_HEAT_SCALARS).toHaveLength(6);
  });
});

describe("mapa de calor · esfuerzos internos", () => {
  const { model } = loadFixture("F3_analisis_reparacion.json");
  const result = firstResult(model);

  it("lee las estaciones y valores exportados sin densificar", () => {
    const frameId = model.frameOrder[0];
    expect(frameId).toBeDefined();
    if (!frameId) return;
    const frameResult = result.frameResults[frameId];
    expect(frameResult).toBeDefined();
    if (!frameResult) return;

    for (const scalar of FORCE_HEAT_SCALARS) {
      const series = frameForceHeatSeries(frameResult, scalar);
      expect(series.stations).toEqual(frameResult.internalForces.stations);
      expect(series.values).toEqual(frameResult.internalForces[scalar]);
    }
  });

  it("el rango global coincide con el mínimo y máximo exportados", () => {
    for (const scalar of FORCE_HEAT_SCALARS) {
      const values: number[] = [];
      for (const frameId of model.frameOrder) {
        const frameResult = result.frameResults[frameId];
        if (frameResult) values.push(...frameResult.internalForces[scalar]);
      }
      const range = resultHeatRange(model, result, scalar);
      expect(Number.isFinite(range.min)).toBe(true);
      expect(Number.isFinite(range.max)).toBe(true);
      expect(range.min).toBe(Math.min(...values));
      expect(range.max).toBe(Math.max(...values));
    }
  });

  it("frameHeatStations entrega la serie del esfuerzo pedido", () => {
    const frameId = model.frameOrder[0];
    expect(frameId).toBeDefined();
    if (!frameId) return;
    const frameResult = result.frameResults[frameId];
    expect(frameResult).toBeDefined();
    if (!frameResult) return;

    for (const scalar of FORCE_HEAT_SCALARS) {
      const series = frameHeatStations(model, result, frameId, scalar);
      expect(series).not.toBeNull();
      expect(series?.stations).toEqual(frameResult.internalForces.stations);
      expect(series?.values).toEqual(frameResult.internalForces[scalar]);
    }
  });

  it("las cerchas también exponen el axial exportado", () => {
    const truss = loadFixture("F3_analisis_cercha.json");
    const trussResult = firstResult(truss.model);
    const range = resultHeatRange(truss.model, trussResult, "fx");
    const values: number[] = [];
    for (const frameId of truss.model.frameOrder) {
      const frameResult = trussResult.frameResults[frameId];
      if (frameResult) values.push(...frameResult.internalForces.fx);
    }
    expect(values.length).toBeGreaterThan(0);
    expect(range.min).toBe(Math.min(...values));
    expect(range.max).toBe(Math.max(...values));
  });
});

describe("mapa de calor · deformada", () => {
  it("delega en deformationHeatRange sin alterar el rango", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    const scalars = ["magnitude", "ux", "uy", "uz", "drift"] as const;
    for (const scalar of scalars) {
      const expected = deformationHeatRange(model, result, scalar);
      const actual = resultHeatRange(model, result, scalar);
      expect(closeTo(actual.min, expected.min, 1e-12, 1e-12)).toBe(true);
      expect(closeTo(actual.max, expected.max, 1e-12, 1e-12)).toBe(true);
    }
  });

  it("frameHeatStations devuelve la curva densificada de la deformada", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[0];
    expect(frameId).toBeDefined();
    if (!frameId) return;
    const series = frameHeatStations(model, result, frameId, "magnitude", {
      subdivisions: 3,
    });
    expect(series).not.toBeNull();
    expect(series?.stations.length).toBeGreaterThan(2);
    expect(series?.values.length).toBe(series?.stations.length);
  });

  it("devuelve null cuando la barra no tiene resultados", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    expect(frameHeatStations(model, result, "__inexistente__", "mz")).toBeNull();
    expect(frameHeatStations(model, result, "__inexistente__", "magnitude")).toBeNull();
  });
});
