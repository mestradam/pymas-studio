import { describe, expect, it } from "vitest";
import type { LocalAxes, PatternResultData, PymasModel } from "../types/pymas";
import {
  autoDiagramScale,
  buildFrameDiagram,
  buildFrameDiagrams,
  DISPLACEMENT_COMPONENTS,
  FORCE_COMPONENTS,
  MissingFrameError,
  MissingFrameResultError,
  sampleDiagram,
  type DiagramSeries,
} from "./diagrams";
import {
  computeLocalAxes,
  distance,
  framePositions,
  modelBounds,
  pointAtStation,
  type Vec3,
} from "./geometry";
import { computeCombination, envelopeCombination, linearCombination } from "./superposition";
import { allFixtures, closeTo, loadFixture } from "./testUtils";

const fixtures = allFixtures();

const END_SIGN_I: Record<(typeof FORCE_COMPONENTS)[number], number> = {
  fx: -1,
  fy: 1,
  fz: 1,
  mx: -1,
  my: 1,
  mz: -1,
};

const END_SIGN_J: Record<(typeof FORCE_COMPONENTS)[number], number> = {
  fx: 1,
  fy: -1,
  fz: -1,
  mx: 1,
  my: -1,
  mz: 1,
};

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

function vecLength(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function vecDeviation(actual: Vec3, expected: Vec3): number {
  return vecLength([
    actual[0] - expected[0],
    actual[1] - expected[1],
    actual[2] - expected[2],
  ]);
}

function maxVecDeviation(actual: Vec3[], expected: Vec3[]): number {
  let maximum = 0;
  for (let index = 0; index < actual.length; index += 1) {
    maximum = Math.max(maximum, vecDeviation(actual[index] ?? [0, 0, 0], expected[index] ?? [0, 0, 0]));
  }
  return maximum;
}

function projectLocal(vector: Vec3, axes: LocalAxes): Vec3 {
  return [
    vector[0] * axes.x[0] + vector[1] * axes.x[1] + vector[2] * axes.x[2],
    vector[0] * axes.y[0] + vector[1] * axes.y[1] + vector[2] * axes.y[2],
    vector[0] * axes.z[0] + vector[1] * axes.z[1] + vector[2] * axes.z[2],
  ];
}

function expectSeriesFinite(series: DiagramSeries): void {
  expect(series.stations.every(Number.isFinite)).toBe(true);
  expect(series.values.every(Number.isFinite)).toBe(true);
  expect(series.offsets.every((value) => value.every(Number.isFinite))).toBe(true);
  expect(series.displayPoints.every((value) => value.every(Number.isFinite))).toBe(true);
}

describe("diagramas · geometría contra fixtures", () => {
  for (const fixture of fixtures) {
    // F2_analisis_actual.json es un volcado de proyecto sin bloque `results`.
    const hasResults = Object.keys(fixture.model.results).length > 0;
    it.skipIf(!hasResults)(`${fixture.file}: estaciones, puntos y ordenadas sobre ejes locales`, () => {
      const { model } = fixture;
      let checked = 0;

      for (const result of Object.values(model.results)) {
        let frameIndex = 0;
        for (const frameId of Object.keys(result.frameResults)) {
          const frame = model.frames[frameId];
          if (!frame) continue;
          const component =
            FORCE_COMPONENTS[frameIndex % FORCE_COMPONENTS.length] ?? "mz";
          frameIndex += 1;

          const diagram = buildFrameDiagram(model, result, frameId, component, 2.5);
          expect(diagram.stations.length).toBeGreaterThan(0);
          expect(diagram.stations[0]).toBeCloseTo(0, 12);
          expect(diagram.stations[diagram.stations.length - 1]).toBeCloseTo(1, 12);
          expectSeriesFinite(diagram);

          let monotonic = true;
          for (let index = 1; index < diagram.stations.length; index += 1) {
            if ((diagram.stations[index] ?? 0) < (diagram.stations[index - 1] ?? 0)) {
              monotonic = false;
            }
          }
          expect(monotonic).toBe(true);

          const { p1, p2 } = framePositions(frame, model.nodes);
          const expectedPoints = diagram.stations.map((station) =>
            pointAtStation(p1, p2, station),
          );
          expect(maxVecDeviation(diagram.points, expectedPoints)).toBeLessThan(1e-12);

          const expectedOffsets = diagram.values.map((value) =>
            diagram.axisVector.map((axisValue) => axisValue * value * 2.5),
          ) as Vec3[];
          expect(maxVecDeviation(diagram.offsets, expectedOffsets)).toBeLessThan(1e-9);

          const expectedDisplay = diagram.points.map((point, index) => {
            const offset = diagram.offsets[index] ?? [0, 0, 0];
            return [
              point[0] + offset[0],
              point[1] + offset[1],
              point[2] + offset[2],
            ] as Vec3;
          });
          expect(maxVecDeviation(diagram.displayPoints, expectedDisplay)).toBeLessThan(1e-12);

          const expectedAxis = frame.localAxes[diagram.axis];
          expect(vecDeviation(diagram.axisVector, expectedAxis)).toBeLessThan(1e-12);

          expect(closeTo(diagram.min.value, Math.min(...diagram.values), 1e-12, 1e-12)).toBe(true);
          expect(closeTo(diagram.max.value, Math.max(...diagram.values), 1e-12, 1e-12)).toBe(true);
          expect(closeTo(diagram.absMax.absValue, Math.max(...diagram.values.map(Math.abs)), 1e-12, 1e-12)).toBe(true);
          expect(diagram.values[diagram.min.index]).toBe(diagram.min.value);
          expect(diagram.values[diagram.max.index]).toBe(diagram.max.value);
          expect(diagram.values[diagram.absMax.index]).toBe(diagram.absMax.value);
          expect(diagram.min.station).toBe(diagram.stations[diagram.min.index]);
          expect(diagram.max.station).toBe(diagram.stations[diagram.max.index]);
          checked += 1;
        }
      }

      expect(checked).toBeGreaterThan(0);
    });
  }

  it("buildFrameDiagrams devuelve las seis componentes de cada tipo", () => {
    const { model } = loadFixture("simple_beam.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[0] ?? "";
    const forces = buildFrameDiagrams(model, result, frameId, "force", 1);
    const displacements = buildFrameDiagrams(model, result, frameId, "displacement", 1);

    expect(forces.map((diagram) => diagram.component)).toEqual([...FORCE_COMPONENTS]);
    expect(displacements.map((diagram) => diagram.component)).toEqual([
      ...DISPLACEMENT_COMPONENTS,
    ]);
    expect(forces.every((diagram) => diagram.kind === "force")).toBe(true);
    expect(displacements.every((diagram) => diagram.kind === "displacement")).toBe(true);
  });
});

describe("diagramas · anclajes de extremo", () => {
  for (const fixture of fixtures) {
    const hasResults = Object.keys(fixture.model.results).length > 0;
    it.skipIf(!hasResults)(`${fixture.file}: los extremos coinciden con end_actions (convención pymas)`, () => {
      const { model } = fixture;
      const mismatches: string[] = [];
      let checked = 0;

      for (const result of Object.values(model.results)) {
        for (const [frameId, frameResult] of Object.entries(result.frameResults)) {
          for (const component of FORCE_COMPONENTS) {
            const values = frameResult.internalForces[component];
            if (values.length === 0) continue;
            const first = values[0] ?? 0;
            const last = values[values.length - 1] ?? 0;
            const expectedFirst = END_SIGN_I[component] * frameResult.endActions.i[component];
            const expectedLast = END_SIGN_J[component] * frameResult.endActions.j[component];
            checked += 1;

            if (!closeTo(first, expectedFirst, 1e-8, 1e-8)) {
              if (mismatches.length < 8) {
                mismatches.push(
                  `${frameId}.${component} I: ${first} != ${expectedFirst}`,
                );
              }
            }
            if (!closeTo(last, expectedLast, 1e-8, 1e-8)) {
              if (mismatches.length < 8) {
                mismatches.push(
                  `${frameId}.${component} J: ${last} != ${expectedLast}`,
                );
              }
            }
          }
        }
      }

      expect(checked).toBeGreaterThan(0);
      expect(mismatches).toEqual([]);
    });
  }

  it("vigas patrón: momentos y cortantes en estaciones conocidas", () => {
    const simple = loadFixture("simple_beam.json").model;
    const simpleResult = firstResult(simple);
    const simpleFrame = simple.frameOrder[0] ?? "";
    const simpleMz = buildFrameDiagram(simple, simpleResult, simpleFrame, "mz");
    const simpleFy = buildFrameDiagram(simple, simpleResult, simpleFrame, "fy");

    expect(simpleMz.max.value).toBeCloseTo(150, 9);
    expect(simpleMz.max.station).toBeCloseTo(0.5, 12);
    expect(simpleMz.max.end).toBe("interior");
    expect(simpleFy.values[0]).toBeCloseTo(60, 9);
    expect(simpleFy.values[simpleFy.values.length - 1]).toBeCloseTo(-60, 9);
    expect(simpleFy.max.end).toBe("i");
    expect(simpleFy.min.end).toBe("j");

    const fixed = loadFixture("fixed_beam.json").model;
    const fixedMz = buildFrameDiagram(
      fixed,
      firstResult(fixed),
      fixed.frameOrder[0] ?? "",
      "mz",
    );
    expect(fixedMz.min.value).toBeCloseTo(-100, 9);
    expect(fixedMz.min.station).toBeCloseTo(0, 12);
    expect(fixedMz.max.value).toBeCloseTo(50, 9);
    expect(fixedMz.max.station).toBeCloseTo(0.5, 12);

    const cantilever = loadFixture("cantilever_beam.json").model;
    const cantileverMz = buildFrameDiagram(
      cantilever,
      firstResult(cantilever),
      cantilever.frameOrder[0] ?? "",
      "mz",
    );
    expect(cantileverMz.min.value).toBeCloseTo(-150, 9);
    expect(cantileverMz.min.end).toBe("i");
    expect(cantileverMz.max.value).toBeCloseTo(0, 12);
    expect(cantileverMz.max.end).toBe("j");

    const propped = loadFixture("propped_beam.json").model;
    const proppedMz = buildFrameDiagram(
      propped,
      firstResult(propped),
      propped.frameOrder[0] ?? "",
      "mz",
    );
    expect(proppedMz.min.value).toBeCloseTo(-150, 9);
    expect(proppedMz.min.station).toBeCloseTo(0, 12);
    expect(proppedMz.max.value).toBeCloseTo(84.36, 9);
    expect(proppedMz.max.station).toBeCloseTo(0.63, 12);

    const continuous = loadFixture("continuous_beam.json").model;
    const continuousMz = buildFrameDiagram(
      continuous,
      firstResult(continuous),
      continuous.frameOrder[0] ?? "",
      "mz",
    );
    expect(continuousMz.min.value).toBeCloseTo(-128.5714285714286, 9);
    expect(continuousMz.max.value).toBeCloseTo(92.59714285714284, 9);
    expect(continuousMz.max.station).toBeCloseTo(0.39, 12);
  });
});

describe("diagramas · planos locales", () => {
  it("eiffel_tower: utiliza los local_axes exportados, no los globales", () => {
    const { model } = loadFixture("eiffel_tower.json");
    const result = firstResult(model);
    let checked = 0;
    let differsFromComputed = 0;

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const diagram = buildFrameDiagram(model, result, frameId, "mz");
      expect(vecDeviation(diagram.axisVector, frame.localAxes.y)).toBeLessThan(1e-12);

      const { p1, p2 } = framePositions(frame, model.nodes);
      const computed = computeLocalAxes(p1, p2, 0);
      if (distance(computed.y, frame.localAxes.y) > 1e-6) differsFromComputed += 1;
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
    expect(differsFromComputed).toBeGreaterThan(0);
  });

  it("space_frame: los 6 desplazamientos internos son locales y coinciden con la proyección nodal", () => {
    const { model } = loadFixture("space_frame.json");
    const result = firstResult(model);
    let checked = 0;

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      const frameResult = result.frameResults[frameId];
      if (!frame || !frameResult) continue;
      const displacements = frameResult.internalDisplacements;
      const lastIndex = displacements.ux.length - 1;
      const ends = [
        { index: 0, nodeId: frame.nodeI },
        { index: lastIndex, nodeId: frame.nodeJ },
      ];

      for (const { index, nodeId } of ends) {
        const nodal = result.nodalDisplacements[nodeId];
        if (!nodal) continue;
        const localTranslation = projectLocal([nodal.ux, nodal.uy, nodal.uz], frame.localAxes);
        const localRotation = projectLocal([nodal.rx, nodal.ry, nodal.rz], frame.localAxes);

        expect(closeTo(displacements.ux[index] ?? 0, localTranslation[0], 1e-12, 1e-9)).toBe(true);
        expect(closeTo(displacements.uy[index] ?? 0, localTranslation[1], 1e-12, 1e-9)).toBe(true);
        expect(closeTo(displacements.uz[index] ?? 0, localTranslation[2], 1e-12, 1e-9)).toBe(true);
        expect(closeTo(displacements.rx[index] ?? 0, localRotation[0], 1e-12, 1e-9)).toBe(true);
        expect(closeTo(displacements.ry[index] ?? 0, localRotation[1], 1e-12, 1e-9)).toBe(true);
        expect(closeTo(displacements.rz[index] ?? 0, localRotation[2], 1e-12, 1e-9)).toBe(true);
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("space_truss: ux es la proyección axial y las componentes transversales exportadas son nulas", () => {
    const { model } = loadFixture("space_truss.json");
    const result = firstResult(model);
    let checked = 0;

    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      const frameResult = result.frameResults[frameId];
      if (!frame || !frameResult) continue;
      const displacements = frameResult.internalDisplacements;
      const lastIndex = displacements.ux.length - 1;
      const ends = [
        { index: 0, nodeId: frame.nodeI },
        { index: lastIndex, nodeId: frame.nodeJ },
      ];

      for (const { index, nodeId } of ends) {
        const nodal = result.nodalDisplacements[nodeId];
        if (!nodal) continue;
        const local = projectLocal([nodal.ux, nodal.uy, nodal.uz], frame.localAxes);
        expect(closeTo(displacements.ux[index] ?? 0, local[0], 1e-12, 1e-9)).toBe(true);
        expect(closeTo(displacements.uy[index] ?? 0, 0, 1e-12, 1e-12)).toBe(true);
        expect(closeTo(displacements.uz[index] ?? 0, 0, 1e-12, 1e-12)).toBe(true);
        checked += 1;
      }

      for (const component of ["uy", "uz", "rx", "ry", "rz"] as const) {
        expect(displacements[component].every((value) => Math.abs(value) < 1e-12)).toBe(true);
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe("diagramas · superposición y envolventes", () => {
  it("F3: el diagrama de una combinación lineal es la suma de los diagramas de sus patrones", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const frames = model.frameOrder.slice(0, 8);
    const patternIds = new Set(
      Object.values(model.loadCombinations).flatMap((combination) =>
        Object.keys(combination.factors),
      ),
    );
    const cache = new Map<string, DiagramSeries>();

    const patternDiagram = (patternId: string, frameId: string, component: string): DiagramSeries => {
      const key = `${patternId}|${frameId}|${component}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const result = model.results[patternId];
      if (!result) throw new Error(`Falta el resultado del patrón ${patternId}.`);
      const diagram = buildFrameDiagram(
        model,
        result,
        frameId,
        component as (typeof FORCE_COMPONENTS)[number],
      );
      cache.set(key, diagram);
      return diagram;
    };

    for (const combination of Object.values(model.loadCombinations)) {
      const combined = computeCombination(model, combination.id);
      if (!("frameResults" in combined)) continue;

      for (const frameId of frames) {
        for (const component of FORCE_COMPONENTS) {
          const diagram = buildFrameDiagram(model, combined, frameId, component);
          for (let index = 0; index < diagram.stations.length; index += 1) {
            const station = diagram.stations[index] ?? 0;
            let expected = 0;
            for (const [patternId, factor] of Object.entries(combination.factors)) {
              if (!patternIds.has(patternId)) continue;
              expected += sampleDiagram(
                patternDiagram(patternId, frameId, component),
                station,
              ).value * factor;
            }
            expect(
              closeTo(diagram.values[index] ?? 0, expected, 1e-9, 1e-9),
            ).toBe(true);
          }
        }
      }
    }
  });

  it("F3: la envolvente acota los diagramas de todos los patrones escalados", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const factors = { D: 1.2, Lr: 1.6 };
    const envelope = envelopeCombination(model, factors);
    const cache = new Map<string, DiagramSeries>();
    let checked = 0;

    const patternDiagram = (patternId: string, frameId: string, component: string): DiagramSeries => {
      const key = `${patternId}|${frameId}|${component}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const result = model.results[patternId];
      if (!result) throw new Error(`Falta el resultado del patrón ${patternId}.`);
      const diagram = buildFrameDiagram(
        model,
        result,
        frameId,
        component as (typeof FORCE_COMPONENTS)[number],
      );
      cache.set(key, diagram);
      return diagram;
    };

    for (const frameId of model.frameOrder) {
      for (const component of FORCE_COMPONENTS) {
        const minimum = buildFrameDiagram(model, envelope.min, frameId, component);
        const maximum = buildFrameDiagram(model, envelope.max, frameId, component);

        for (let index = 0; index < minimum.stations.length; index += 1) {
          const station = minimum.stations[index] ?? 0;
          const minValue = minimum.values[index] ?? 0;
          const maxValue = maximum.values[index] ?? 0;
          for (const [patternId, factor] of Object.entries(factors)) {
            const value =
              sampleDiagram(patternDiagram(patternId, frameId, component), station).value *
              factor;
            expect(value).toBeGreaterThanOrEqual(minValue - 1e-9);
            expect(value).toBeLessThanOrEqual(maxValue + 1e-9);
            checked += 1;
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe("diagramas · escala automática y cursor", () => {
  it("auto-escala proporcional a la diagonal y muestreo lineal del cursor", () => {
    const { model } = loadFixture("simple_beam.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[0] ?? "";
    const targetFraction = 0.1;
    const factor = autoDiagramScale(model, result, { targetFraction });
    const target = modelBounds(model).diagonal * targetFraction;

    expect(Number.isFinite(factor)).toBe(true);
    expect(factor).toBeGreaterThan(0);

    const mz = buildFrameDiagram(model, result, frameId, "mz", factor);
    expect(mz.absMax.absValue).toBeCloseTo(150, 9);
    const maxOffset = Math.max(...mz.offsets.map(vecLength));
    expect(closeTo(maxOffset, target, 1e-9, 1e-9)).toBe(true);

    const sample = sampleDiagram(mz, 0.25);
    expect(sample.value).toBeCloseTo(112.5, 9);
    const expectedOffset = mz.axisVector.map(
      (axisValue) => axisValue * sample.value * factor,
    ) as Vec3;
    expect(vecDeviation(sample.offset, expectedOffset)).toBeLessThan(1e-12);

    const start = sampleDiagram(mz, 0);
    expect(vecDeviation(start.position, mz.points[0] ?? [0, 0, 0])).toBeLessThan(1e-12);
    const outside = sampleDiagram(mz, 2);
    expect(outside.value).toBeCloseTo(
      mz.values[mz.values.length - 1] ?? 0,
      12,
    );
  });

  it("devuelve factor 1 y diagramas nulos cuando no hay esfuerzos", () => {
    const { model } = loadFixture("simple_beam.json");
    const frameId = model.frameOrder[0] ?? "";
    const zero = linearCombination(model, { default: 0 });
    const factor = autoDiagramScale(model, zero);
    const diagram = buildFrameDiagram(model, zero, frameId, "mz", factor);

    expect(factor).toBe(1);
    expect(diagram.max.value).toBe(0);
    expect(diagram.min.value).toBe(0);
    expect(diagram.offsets.every((offset) => vecLength(offset) === 0)).toBe(true);
  });

  it("lanza errores claros ante barras o resultados ausentes", () => {
    const { model } = loadFixture("simple_beam.json");
    const result = firstResult(model);
    const frameId = model.frameOrder[0] ?? "";
    expect(() => buildFrameDiagram(model, result, "no-existe", "mz")).toThrow(
      MissingFrameError,
    );
    const emptyResult: PatternResultData = {
      nodalDisplacements: {},
      reactions: {},
      frameResults: {},
    };
    expect(() => buildFrameDiagram(model, emptyResult, frameId, "mz")).toThrow(
      MissingFrameResultError,
    );
  });
});
