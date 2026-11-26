import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import {
  autoDeformationScale,
  buildDeformation,
  buildDeformedFrame,
  deformationHeatRange,
  deformedPointAt,
  hermiteInterpolateVectors,
  isTrussFrame,
} from "./deformation";
import { framePositions, modelBounds, type Vec3 } from "./geometry";
import { heatmapColor, heatmapRange } from "./heatmap";
import { linearCombination } from "./superposition";
import { allFixtures, closeTo, loadFixture } from "./testUtils";

const fixtures = allFixtures();

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

function vecLength(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function maxDeviation(actual: Vec3, expected: Vec3): number {
  return Math.max(
    Math.abs(actual[0] - expected[0]),
    Math.abs(actual[1] - expected[1]),
    Math.abs(actual[2] - expected[2]),
  );
}

function seriesAt(values: number[], index: number): number {
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function localToGlobal(
  vector: Vec3,
  axes: { x: Vec3; y: Vec3; z: Vec3 },
): Vec3 {
  return [
    vector[0] * axes.x[0] + vector[1] * axes.y[0] + vector[2] * axes.z[0],
    vector[0] * axes.x[1] + vector[1] * axes.y[1] + vector[2] * axes.z[1],
    vector[0] * axes.x[2] + vector[1] * axes.y[2] + vector[2] * axes.z[2],
  ];
}

function globalToLocal(
  vector: Vec3,
  axes: { x: Vec3; y: Vec3; z: Vec3 },
): Vec3 {
  return [
    vector[0] * axes.x[0] + vector[1] * axes.x[1] + vector[2] * axes.x[2],
    vector[0] * axes.y[0] + vector[1] * axes.y[1] + vector[2] * axes.y[2],
    vector[0] * axes.z[0] + vector[1] * axes.z[1] + vector[2] * axes.z[2],
  ];
}

/** Distancia de un punto a la recta que une `a` y `b`. */
function distanceToChord(point: Vec3, a: Vec3, b: Vec3): number {
  const chord: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const offset: Vec3 = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
  const cross: Vec3 = [
    offset[1] * chord[2] - offset[2] * chord[1],
    offset[2] * chord[0] - offset[0] * chord[2],
    offset[0] * chord[1] - offset[1] * chord[0],
  ];
  const length = Math.hypot(chord[0], chord[1], chord[2]);
  return length > 1e-15 ? Math.hypot(cross[0], cross[1], cross[2]) / length : 0;
}

describe("deformada · interpolación de Hermite", () => {
  it("pasa por las estaciones originales y conserva continuidad C1", () => {
    const stations = [0, 0.2, 0.45, 0.7, 1];
    const values: Vec3[] = stations.map((x) => [x, x * x, 0.2 * Math.sin(Math.PI * x)]);
    const steps = 16;
    const curve = hermiteInterpolateVectors(stations, values, steps);

    expect(curve.stations).toHaveLength((stations.length - 1) * steps + 1);
    expect(curve.stations[0]).toBeCloseTo(0, 12);
    expect(curve.stations[curve.stations.length - 1]).toBeCloseTo(1, 12);

    for (let index = 0; index < stations.length; index += 1) {
      const curveIndex = index * steps;
      expect(curve.stations[curveIndex]).toBeCloseTo(stations[index] ?? 0, 12);
      expect(maxDeviation(curve.values[curveIndex] ?? [0, 0, 0], values[index] ?? [0, 0, 0])).toBeLessThan(1e-12);
    }

    // Derivada por la izquierda y por la derecha en una estación interior.
    const stationIndex = 2 * steps;
    const leftA = curve.values[stationIndex - 2] ?? [0, 0, 0];
    const leftB = curve.values[stationIndex - 1] ?? [0, 0, 0];
    const center = curve.values[stationIndex] ?? [0, 0, 0];
    const rightA = curve.values[stationIndex + 1] ?? [0, 0, 0];
    const leftDx = (curve.stations[stationIndex] ?? 0) - (curve.stations[stationIndex - 2] ?? 0);
    const rightDx = (curve.stations[stationIndex + 2] ?? 0) - (curve.stations[stationIndex] ?? 0);
    for (let component = 0; component < 3; component += 1) {
      const leftDerivative =
        ((leftB[component] ?? 0) - (leftA[component] ?? 0)) / Math.max(leftDx / 2, 1e-15);
      const rightDerivative =
        ((rightA[component] ?? 0) - (center[component] ?? 0)) / Math.max(rightDx / 2, 1e-15);
      expect(closeTo(leftDerivative, rightDerivative, 0.1, 0.1)).toBe(true);
    }
  });

  it("reproduce una función lineal sin oscilaciones espurias", () => {
    const stations = [0, 0.3, 0.6, 1];
    const values: Vec3[] = stations.map((x) => [2 * x, -3 * x, 0.5 * x]);
    const curve = hermiteInterpolateVectors(stations, values, 5);
    for (let index = 0; index < curve.stations.length; index += 1) {
      const x = curve.stations[index] ?? 0;
      expect(maxDeviation(curve.values[index] ?? [0, 0, 0], [2 * x, -3 * x, 0.5 * x])).toBeLessThan(1e-12);
    }
  });
});

describe("deformada · ejes locales contra fixtures", () => {
  it("space_frame: los extremos deformados coinciden con los desplazamientos nodales globales", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      const frameResult = result.frameResults[frameId];
      if (!frame || !frameResult) continue;
      const curve = buildDeformedFrame(model, result, frameId, {
        scale: 1,
        subdivisions: 3,
      });
      const lastIndex = curve.stations.length - 1;
      const ends = [
        { index: 0, nodeId: frame.nodeI },
        { index: lastIndex, nodeId: frame.nodeJ },
      ];
      for (const { index, nodeId } of ends) {
        const nodal = result.nodalDisplacements[nodeId];
        expect(nodal).toBeDefined();
        if (!nodal) continue;
        const undeformed = curve.undeformedPoints[index] ?? [0, 0, 0];
        const deformed = curve.deformedPoints[index] ?? [0, 0, 0];
        const expected: Vec3 = [
          undeformed[0] + nodal.ux,
          undeformed[1] + nodal.uy,
          undeformed[2] + nodal.uz,
        ];
        expect(maxDeviation(deformed, expected)).toBeLessThan(1e-12);
      }
    }
  });

  it("clasifica derivas sólo en barras verticales", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    let verticalCurves = 0;
    let horizontalCurves = 0;

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame || !result.frameResults[frameId]) continue;
      const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 3 });
      const { p1, p2 } = framePositions(frame, model.nodes);
      const vertical = Math.abs(p2[2] - p1[2]) / Math.max(frame.length, 1e-15) >= 0.5;
      expect(curve.isVertical).toBe(vertical);
      if (vertical) {
        verticalCurves += 1;
        expect(curve.heat.drift.some((value) => value > 0)).toBe(true);
      } else {
        horizontalCurves += 1;
        expect(curve.heat.drift.every((value) => value === 0)).toBe(true);
      }
    }

    expect(verticalCurves).toBeGreaterThan(0);
    expect(horizontalCurves).toBeGreaterThan(0);
  });

  it.each(["x", "y", "z"] as const)(
    "la deriva usa el eje vertical elegido (up=%s)",
    (upAxis) => {
      const { model } = loadFixture("space_frame.json");
      const result = firstResult(model);
      const axis = { x: 0, y: 1, z: 2 }[upAxis];

      for (const frameId of model.frameOrder) {
        const frame = model.frames[frameId];
        if (!frame || !result.frameResults[frameId]) continue;
        const curve = buildDeformedFrame(model, result, frameId, {
          subdivisions: 3,
          upAxis,
        });
        const { p1, p2 } = framePositions(frame, model.nodes);
        const vertical =
          Math.abs((p2[axis] ?? 0) - (p1[axis] ?? 0)) / Math.max(frame.length, 1e-15) >=
          0.5;
        expect(curve.isVertical).toBe(vertical);
        if (!vertical) {
          expect(curve.heat.drift.every((value) => value === 0)).toBe(true);
        }
      }

      const range = deformationHeatRange(model, result, "drift", upAxis);
      expect(Number.isFinite(range.max)).toBe(true);
      expect(range.min).toBeGreaterThanOrEqual(0);
    },
  );
});

describe("deformada · todos los fixtures", () => {
  for (const fixture of fixtures) {
    // F2_analisis_actual.json es un volcado de proyecto sin bloque `results`.
    const hasResults = Object.keys(fixture.model.results).length > 0;
    it.skipIf(!hasResults)(`${fixture.file}: curvas finitas, estaciones y mapa de calor`, () => {
      const { model } = fixture;
      let checked = 0;

      for (const result of Object.values(model.results)) {
        for (const frameId of model.frameOrder) {
          const frame = model.frames[frameId];
          const frameResult = result.frameResults[frameId];
          if (!frame || !frameResult) continue;
          const curve = buildDeformedFrame(model, result, frameId, {
            scale: 1.5,
            subdivisions: 3,
          });
          const series = frameResult.internalDisplacements;
          const count = curve.sourceStations.length;
          const truss = isTrussFrame(model, frame);

          expect(curve.stations.length).toBe((Math.max(count, 2) - 1) * 3 + 1);
          expect(curve.stations[0]).toBeCloseTo(0, 12);
          expect(curve.stations[curve.stations.length - 1]).toBeCloseTo(1, 12);
          expect(curve.heat.magnitude.every(Number.isFinite)).toBe(true);
          expect(curve.heat.drift.every(Number.isFinite)).toBe(true);
          expect(curve.undeformedPoints.every((value) => value.every(Number.isFinite))).toBe(true);
          expect(curve.deformedPoints.every((value) => value.every(Number.isFinite))).toBe(true);

          for (let sourceIndex = 0; sourceIndex < count; sourceIndex += 1) {
            const curveIndex = sourceIndex * 3;
            const station = curve.sourceStations[sourceIndex] ?? 0;
            const uI = result.nodalDisplacements[frame.nodeI];
            const uJ = result.nodalDisplacements[frame.nodeJ];
            const nodalAvailable = uI !== undefined && uJ !== undefined;

            let expectedLocal: Vec3;
            let expectedGlobal: Vec3;
            if (truss && nodalAvailable) {
              expectedGlobal = [
                (1 - station) * uI.ux + station * uJ.ux,
                (1 - station) * uI.uy + station * uJ.uy,
                (1 - station) * uI.uz + station * uJ.uz,
              ];
              expectedLocal = globalToLocal(expectedGlobal, frame.localAxes);
            } else {
              expectedLocal = [
                seriesAt(series.ux, sourceIndex),
                seriesAt(series.uy, sourceIndex),
                seriesAt(series.uz, sourceIndex),
              ];
              expectedGlobal = localToGlobal(expectedLocal, frame.localAxes);
            }
            expect(
              maxDeviation(curve.localDisplacements[curveIndex] ?? [0, 0, 0], expectedLocal),
            ).toBeLessThan(1e-12);
            expect(curve.stations[curveIndex]).toBeCloseTo(station, 12);

            const displacement = curve.globalDisplacements[curveIndex] ?? [0, 0, 0];
            expect(maxDeviation(displacement, expectedGlobal)).toBeLessThan(1e-12);
            const base = curve.undeformedPoints[curveIndex] ?? [0, 0, 0];
            const deformed = curve.deformedPoints[curveIndex] ?? [0, 0, 0];
            expect(
              maxDeviation(deformed, [
                base[0] + displacement[0] * 1.5,
                base[1] + displacement[1] * 1.5,
                base[2] + displacement[2] * 1.5,
              ]),
            ).toBeLessThan(1e-12);
            expect(
              closeTo(
                curve.heat.magnitude[curveIndex] ?? 0,
                vecLength(displacement),
                1e-12,
                1e-12,
              ),
            ).toBe(true);
          }
          checked += 1;
        }
      }

      expect(checked).toBeGreaterThan(0);
    });
  }

  it("auto-escala y modelo global de deformación", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    const factor = autoDeformationScale(model, result, 0.1);
    const target = modelBounds(model).diagonal * 0.1;
    expect(Number.isFinite(factor)).toBe(true);
    expect(factor).toBeGreaterThan(0);

    const data = buildDeformation(model, result, { scale: factor, subdivisions: 4 });
    expect(data.frames.length).toBeGreaterThan(0);
    expect(data.maxMagnitude).toBeGreaterThan(0);
    const maximum = Math.max(
      ...data.frames.map((curve) => curve.maxMagnitude * factor),
    );
    expect(closeTo(maximum, target, 1e-3, 1e-3)).toBe(true);
  });

  it("sin desplazamientos devuelve factor 1 y curvas nulas", () => {
    const { model } = loadFixture("simple_beam.json");
    const zero = linearCombination(model, { default: 0 });
    expect(autoDeformationScale(model, zero)).toBe(1);
    const curve = buildDeformedFrame(
      model,
      zero,
      model.frameOrder[0] ?? "",
      { scale: 10, subdivisions: 3 },
    );
    expect(curve.maxMagnitude).toBe(0);
    expect(
      curve.deformedPoints.every((point, index) => {
        const base = curve.undeformedPoints[index] ?? [0, 0, 0];
        return maxDeviation(point, base) < 1e-12;
      }),
    ).toBe(true);
  });
});

describe("deformada · celosías", () => {
  it("detecta celosías por tipo de modelo y por rigidez a flexión", () => {
    const truss = loadFixture("space_truss.json").model;
    const trussFrame = truss.frames[truss.frameOrder[0] ?? ""];
    expect(trussFrame).toBeDefined();
    if (trussFrame) expect(isTrussFrame(truss, trussFrame)).toBe(true);

    const bar = loadFixture("simple_bar.json").model;
    const barFrame = bar.frames[bar.frameOrder[0] ?? ""];
    expect(barFrame).toBeDefined();
    if (barFrame) expect(isTrussFrame(bar, barFrame)).toBe(true);

    const reparacion = loadFixture("F3_analisis_reparacion.json").model;
    const trussMembers = Object.values(reparacion.frames).filter((member) =>
      isTrussFrame(reparacion, member),
    );
    expect(trussMembers).toHaveLength(8);
    const regular = Object.values(reparacion.frames).find(
      (member) => !isTrussFrame(reparacion, member),
    );
    expect(regular).toBeDefined();
    if (regular) expect(isTrussFrame(reparacion, regular)).toBe(false);
  });

  it("dibuja la cuerda recta entre nudos desplazados", () => {
    const { model } = loadFixture("F3_analisis_cercha.json");
    const result = firstResult(model);
    let checked = 0;

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      const uI = frame ? result.nodalDisplacements[frame.nodeI] : undefined;
      const uJ = frame ? result.nodalDisplacements[frame.nodeJ] : undefined;
      if (!frame || !uI || !uJ) continue;
      const curve = buildDeformedFrame(model, result, frameId, {
        scale: 3,
        subdivisions: 4,
      });
      const first = curve.deformedPoints[0] ?? [0, 0, 0];
      const last = curve.deformedPoints[curve.deformedPoints.length - 1] ?? [0, 0, 0];
      const firstBase = curve.undeformedPoints[0] ?? [0, 0, 0];
      const lastBase =
        curve.undeformedPoints[curve.undeformedPoints.length - 1] ?? [0, 0, 0];

      expect(
        maxDeviation(first, [
          firstBase[0] + uI.ux * 3,
          firstBase[1] + uI.uy * 3,
          firstBase[2] + uI.uz * 3,
        ]),
      ).toBeLessThan(1e-12);
      expect(
        maxDeviation(last, [
          lastBase[0] + uJ.ux * 3,
          lastBase[1] + uJ.uy * 3,
          lastBase[2] + uJ.uz * 3,
        ]),
      ).toBeLessThan(1e-12);

      const span = Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]);
      for (const point of curve.deformedPoints) {
        expect(distanceToChord(point, first, last)).toBeLessThan(Math.max(span, 1) * 1e-12);
      }
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("recupera el desplazamiento transversal que no trae internal_displacements", () => {
    const { model } = loadFixture("F3_analisis_cercha.json");
    const result = firstResult(model);
    let recovered = 0;

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      const frameResult = result.frameResults[frameId];
      if (!frame || !frameResult) continue;
      const curve = buildDeformedFrame(model, result, frameId, { subdivisions: 3 });
      const exportedLateral = Math.max(
        ...frameResult.internalDisplacements.uy.map(Math.abs),
        ...frameResult.internalDisplacements.uz.map(Math.abs),
      );
      const recoveredLateral = Math.max(
        ...curve.localDisplacements.map((value) => Math.hypot(value[1], value[2])),
      );
      if (exportedLateral < 1e-12 && recoveredLateral > 1e-9) recovered += 1;
    }

    expect(recovered).toBeGreaterThan(0);
  });

  it("auto-escala y mapa de calor usan la deformada nodal completa", () => {
    const { model } = loadFixture("F3_analisis_cercha.json");
    const result = firstResult(model);
    const factor = autoDeformationScale(model, result, 0.1);
    const target = modelBounds(model).diagonal * 0.1;
    expect(Number.isFinite(factor)).toBe(true);
    expect(factor).toBeGreaterThan(0);

    const data = buildDeformation(model, result, { scale: factor, subdivisions: 4 });
    const maximum = Math.max(
      ...data.frames.map((curve) => curve.maxMagnitude * factor),
    );
    expect(closeTo(maximum, target, 1e-6, 1e-6)).toBe(true);

    let nodalMax = 0;
    for (const displacement of Object.values(result.nodalDisplacements)) {
      nodalMax = Math.max(
        nodalMax,
        vecLength([displacement.ux, displacement.uy, displacement.uz]),
      );
    }
    const range = deformationHeatRange(model, result, "magnitude");
    expect(range.max).toBeGreaterThanOrEqual(nodalMax - 1e-12);
    expect(closeTo(range.max, nodalMax, 1e-9, 1e-9)).toBe(true);
  });
});

describe("mapa de calor", () => {
  it("interpola el degradado, acota valores y calcula rangos", () => {
    const low = heatmapColor(-1, 0, 10);
    const high = heatmapColor(11, 0, 10);
    expect(low[2]).toBeGreaterThan(low[0]);
    expect(high[0]).toBeGreaterThan(high[2]);
    expect(heatmapRange([3, -2, 7, Number.NaN])).toEqual({ min: -2, max: 7 });
    expect(heatmapRange([])).toEqual({ min: 0, max: 0 });
  });
});

describe("deformada · punto en estación (cursor 2D/3D)", () => {
  it("reproduce las estaciones densificadas y los extremos", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    const curve = buildDeformedFrame(model, result, model.frameOrder[0] ?? "", {
      scale: 5,
      subdivisions: 4,
    });

    for (let index = 0; index < curve.stations.length; index += 1) {
      const point = deformedPointAt(curve, curve.stations[index] ?? 0);
      expect(maxDeviation(point, curve.deformedPoints[index] ?? [0, 0, 0])).toBeLessThan(1e-12);
    }

    expect(
      maxDeviation(
        deformedPointAt(curve, 0),
        curve.deformedPoints[0] ?? [0, 0, 0],
      ),
    ).toBeLessThan(1e-12);
    expect(
      maxDeviation(
        deformedPointAt(curve, 1),
        curve.deformedPoints[curve.deformedPoints.length - 1] ?? [0, 0, 0],
      ),
    ).toBeLessThan(1e-12);
  });

  it("interpola linealmente entre estaciones y acota fuera de rango", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    const curve = buildDeformedFrame(model, result, model.frameOrder[0] ?? "", {
      scale: 5,
      subdivisions: 4,
    });
    const middleIndex = Math.floor(curve.stations.length / 2);
    const x0 = curve.stations[middleIndex] ?? 0;
    const x1 = curve.stations[middleIndex + 1] ?? 1;
    const p0 = curve.deformedPoints[middleIndex] ?? [0, 0, 0];
    const p1 = curve.deformedPoints[middleIndex + 1] ?? [0, 0, 0];
    const midpoint = deformedPointAt(curve, (x0 + x1) / 2);
    const expected: Vec3 = [
      (p0[0] + p1[0]) / 2,
      (p0[1] + p1[1]) / 2,
      (p0[2] + p1[2]) / 2,
    ];
    expect(maxDeviation(midpoint, expected)).toBeLessThan(1e-12);

    expect(
      maxDeviation(
        deformedPointAt(curve, -2),
        curve.deformedPoints[0] ?? [0, 0, 0],
      ),
    ).toBeLessThan(1e-12);
    expect(
      maxDeviation(
        deformedPointAt(curve, 3),
        curve.deformedPoints[curve.deformedPoints.length - 1] ?? [0, 0, 0],
      ),
    ).toBeLessThan(1e-12);
  });

  it("tolera curvas vacías o degeneradas", () => {
    const empty = {
      frameId: "x",
      sourceStations: [],
      stations: [],
      undeformedPoints: [],
      localDisplacements: [],
      globalDisplacements: [],
      localRotations: [],
      globalRotations: [],
      deformedPoints: [],
      isVertical: false,
      maxMagnitude: 0,
      heat: { magnitude: [], ux: [], uy: [], uz: [], rx: [], ry: [], rz: [], drift: [] },
    } satisfies Parameters<typeof deformedPointAt>[0];
    expect(deformedPointAt(empty, 0.5)).toEqual([0, 0, 0]);
  });
});
