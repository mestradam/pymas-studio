import { describe, expect, it } from "vitest";
import type { LocalAxes } from "../types/pymas";
import {
  axesAreOrthonormal,
  computeLocalAxes,
  distance,
  framePositions,
  localAxesFromUnknown,
  niceGridSize,
  pointAtStation,
  projectLoadToGlobal,
  type Vec3,
} from "./geometry";
import { allFixtures, closeTo } from "./testUtils";

const fixtures = allFixtures();

function expectVecClose(actual: Vec3, expected: Vec3, tolerance = 1e-9): void {
  for (let i = 0; i < 3; i += 1) {
    expect(closeTo(actual[i] ?? 0, expected[i] ?? 0, tolerance, tolerance)).toBe(true);
  }
}

function expectAxesClose(actual: LocalAxes, expected: LocalAxes, tolerance = 1e-9): void {
  expectVecClose(actual.x, expected.x, tolerance);
  expectVecClose(actual.y, expected.y, tolerance);
  expectVecClose(actual.z, expected.z, tolerance);
}

describe("geometry · convención de ejes locales", () => {
  it("viga horizontal: ex=X, ey=Y, ez=Z", () => {
    const axes = computeLocalAxes([0, 0, 0], [4, 0, 0]);
    expectAxesClose(axes, {
      x: [1, 0, 0],
      y: [0, 1, 0],
      z: [0, 0, 1],
    });
    expect(axesAreOrthonormal(axes)).toBe(true);
  });

  it("columna vertical: ey=(0,1,0), ez=ex×ey", () => {
    const axes = computeLocalAxes([2, 3, 0], [2, 3, 8]);
    expectAxesClose(axes, {
      x: [0, 0, 1],
      y: [0, 1, 0],
      z: [-1, 0, 0],
    });
    expect(axesAreOrthonormal(axes)).toBe(true);
  });

  it("aplica roll_angle con Rodrigues alrededor de ex", () => {
    const axes = computeLocalAxes([0, 0, 0], [1, 0, 0], Math.PI / 2);
    expectAxesClose(axes, {
      x: [1, 0, 0],
      y: [0, 0, 1],
      z: [0, -1, 0],
    });
    expect(axesAreOrthonormal(axes)).toBe(true);
  });

  it("respeta el signo de roll_angle", () => {
    const positive = computeLocalAxes([0, 0, 0], [1, 0, 0], Math.PI / 4);
    const negative = computeLocalAxes([0, 0, 0], [1, 0, 0], -Math.PI / 4);
    expect(positive.y[1]).toBeGreaterThan(0);
    expect(negative.y[1]).toBeGreaterThan(0);
    expect(positive.y[2]).toBeGreaterThan(0);
    expect(negative.y[2]).toBeLessThan(0);
  });

  it("interpola puntos y calcula una grilla razonable", () => {
    expect(pointAtStation([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
    const grid = niceGridSize(350);
    expect(grid.size).toBeGreaterThan(350);
    expect(grid.divisions).toBeGreaterThan(0);
  });

  it("proyecta cargas locales y globales", () => {
    const axes = computeLocalAxes([0, 0, 0], [1, 0, 0]);
    const local = projectLoadToGlobal(
      { type: "DistributedLoad", coordinateSystem: "local", fx: 0, fy: -3, fz: 0 },
      axes,
    );
    expectVecClose(local, [0, -3, 0]);
    const global = projectLoadToGlobal(
      { type: "DistributedLoad", coordinateSystem: "global", fx: 0, fy: -3, fz: 0 },
      axes,
    );
    expectVecClose(global, [0, -3, 0]);
  });
});

describe("geometry · ejes reales de los fixtures", () => {
  for (const fixture of fixtures) {
    it(`${fixture.file}: ejes ortonormales, longitudes y origen de exportación`, () => {
      const { model, raw } = fixture;
      const rawFrames = (raw.frames ?? {}) as Record<string, Record<string, unknown>>;
      for (const frame of Object.values(model.frames)) {
        expect(axesAreOrthonormal(frame.localAxes)).toBe(true);
        const { p1, p2 } = framePositions(frame, model.nodes);
        expect(closeTo(frame.length, distance(p1, p2), 1e-9, 1e-9)).toBe(true);

        const rawFrame = rawFrames[frame.id];
        const rawAxes = localAxesFromUnknown(
          rawFrame?.local_axes ?? rawFrame?.localAxes ?? rawFrame?.axes,
        );
        if (rawAxes) {
          expect(frame.localAxesSource).toBe("exported");
          expectAxesClose(frame.localAxes, rawAxes, 1e-9);
        } else {
          expect(frame.localAxesSource).toBe("computed");
        }
      }
    });
  }
});
