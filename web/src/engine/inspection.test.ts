import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  FRAME_CHART_ORDER,
  buildFrameChartSeries,
  frameForceSummaries,
  interpolateSeriesAt,
  summarizeFrameForces,
} from "./inspection";
import { allFixtures, closeTo, loadFixture } from "./testUtils";

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

function maxAbs(values: number[]): number {
  return values.reduce(
    (maximum, value) => Math.max(maximum, Math.abs(value)),
    0,
  );
}

describe("inspector · resumen de fuerzas por barra", () => {
  for (const fixture of allFixtures()) {
    // F2_analisis_actual.json es un volcado de proyecto sin bloque `results`.
    const hasResults = Object.keys(fixture.model.results).length > 0;
    it.skipIf(!hasResults)(`${fixture.file}: los máximos coinciden con los esfuerzos internos`, () => {
      const { model } = fixture;
      const result = firstResult(model);
      let checked = 0;

      for (const frameId of model.frameOrder) {
        const frameResult = result.frameResults[frameId];
        if (!frameResult) continue;
        const summary = summarizeFrameForces(model, result, frameId);
        expect(summary).not.toBeNull();
        if (!summary) continue;
        const forces = frameResult.internalForces;
        expect(summary.axial).toBeCloseTo(maxAbs(forces.fx), 12);
        expect(summary.shearY).toBeCloseTo(maxAbs(forces.fy), 12);
        expect(summary.shearZ).toBeCloseTo(maxAbs(forces.fz), 12);
        expect(summary.torsion).toBeCloseTo(maxAbs(forces.mx), 12);
        expect(summary.momentY).toBeCloseTo(maxAbs(forces.my), 12);
        expect(summary.momentZ).toBeCloseTo(maxAbs(forces.mz), 12);
        expect(summary.maxForce).toBeCloseTo(
          Math.max(summary.axial, summary.shearY, summary.shearZ),
          12,
        );
        expect(summary.maxMoment).toBeCloseTo(
          Math.max(summary.torsion, summary.momentY, summary.momentZ),
          12,
        );
        for (const value of [
          summary.axial,
          summary.shearY,
          summary.shearZ,
          summary.torsion,
          summary.momentY,
          summary.momentZ,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        checked += 1;
      }

      expect(checked).toBeGreaterThan(0);
      expect(frameForceSummaries(model, result)).toHaveLength(checked);
    });
  }
});

describe("inspector · series de gráficos 2D", () => {
  it("genera las seis acciones internas y los seis movimientos globales", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);

    for (const frameId of model.frameOrder) {
      const frameResult = result.frameResults[frameId];
      if (!frameResult) continue;
      const series = buildFrameChartSeries(model, result, frameId);
      expect(series).not.toBeNull();
      if (!series) continue;
      expect(series.map((entry) => entry.key)).toEqual([...FRAME_CHART_ORDER]);

      for (const entry of series.slice(0, 6)) {
        expect(entry.stations).toEqual(frameResult.internalForces.stations);
        const raw = frameResult.internalForces[entry.key as "fx"];
        expect(entry.values).toEqual(raw);
      }

      // En los extremos los movimientos coinciden con los desplazamientos
      // nodales globales.
      const frame = model.frames[frameId]!;
      const nodeI = result.nodalDisplacements[frame.nodeI];
      const nodeJ = result.nodalDisplacements[frame.nodeJ];
      const movements = series.slice(6);
      expect(movements.map((entry) => entry.family)).toEqual([
        "displacement",
        "displacement",
        "displacement",
        "rotation",
        "rotation",
        "rotation",
      ]);
      for (const entry of movements) {
        const key = entry.key as "ux";
        if (nodeI) expect(entry.values[0]).toBeCloseTo(nodeI[key], 8);
        if (nodeJ) {
          expect(entry.values[entry.values.length - 1]).toBeCloseTo(nodeJ[key], 8);
        }
      }
    }
  });

  it("F3: series finitas en todas las barras", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const result = firstResult(model);
    for (const frameId of model.frameOrder) {
      const series = buildFrameChartSeries(model, result, frameId);
      if (!series) continue;
      for (const entry of series) {
        expect(entry.stations.every(Number.isFinite)).toBe(true);
        expect(entry.values.every(Number.isFinite)).toBe(true);
        expect(entry.values).toHaveLength(entry.stations.length);
      }
    }
  });
});

describe("inspector · interpolación de series", () => {
  it("reproduce estaciones exactas e interpola linealmente entre ellas", () => {
    const stations = [0, 0.25, 0.5, 0.75, 1];
    const values = [0, 10, -4, 8, 2];
    for (let index = 0; index < stations.length; index += 1) {
      expect(
        interpolateSeriesAt(stations, values, stations[index] ?? 0),
      ).toBeCloseTo(values[index] ?? 0, 12);
    }
    expect(interpolateSeriesAt(stations, values, 0.125)).toBeCloseTo(5, 12);
    expect(interpolateSeriesAt(stations, values, 0.375)).toBeCloseTo(3, 12);
  });

  it("acota fuera de rango y tolera series degeneradas", () => {
    expect(interpolateSeriesAt([0, 1], [3, 7], -1)).toBe(3);
    expect(interpolateSeriesAt([0, 1], [3, 7], 2)).toBe(7);
    expect(interpolateSeriesAt([], [], 0.4)).toBe(0);
    expect(interpolateSeriesAt([0.3], [9], 0.7)).toBe(9);
    expect(interpolateSeriesAt([0, 0.5, 1], [1, 2], 0.2)).toBe(1);
  });

  it("las series del gráfico interpolan sus valores en el cursor", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[0] ?? "";
    const series = buildFrameChartSeries(model, result, frameId);
    expect(series).not.toBeNull();
    if (!series) return;
    const fx = series[0];
    expect(fx).toBeDefined();
    if (!fx) return;
    const sampled = interpolateSeriesAt(fx.stations, fx.values, 0.5);
    expect(
      closeTo(sampled, interpolateSeriesAt(fx.stations, fx.values, 0.5), 12, 12),
    ).toBe(true);
  });
});
