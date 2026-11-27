import { describe, expect, it } from "vitest";
import {
  boxCorners,
  cameraBasis,
  FIT_MARGIN,
  fitCameraToPoints,
} from "./cameraFit";
import type { Vec3 } from "./geometry";

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

describe("encuadre de cámara", () => {
  const corners = boxCorners([0, 0, 0], [10, 2, 1]);

  it("ortográfica en planta: centra la caja y usa el zoom máximo", () => {
    const fit = fitCameraToPoints(corners, [0, 0, 1], [0, 1, 0], {
      type: "orthographic",
      width: 1000,
      height: 500,
    });
    expect(fit).not.toBeNull();
    // Ancho limitante: 1000 px / 10 m · margen.
    expect(fit!.zoom).toBeCloseTo(100 * FIT_MARGIN, 9);
    expect(fit!.target[0]).toBeCloseTo(5, 9);
    expect(fit!.target[1]).toBeCloseTo(1, 9);
    // La cámara queda por encima de todo el contenido.
    expect(fit!.position[2]).toBeGreaterThan(1);
  });

  it("perspectiva: todas las esquinas caben y una toca el margen", () => {
    const direction: Vec3 = [1, -1, 0.82];
    const up: Vec3 = [0, 0, 1];
    const fov = 42;
    const aspect = 1.6;
    const fit = fitCameraToPoints(corners, direction, up, {
      type: "perspective",
      fov,
      aspect,
    })!;
    const basis = cameraBasis(direction, up);
    const tanV = Math.tan((fov * Math.PI) / 360) * FIT_MARGIN;
    const tanH = tanV * aspect;

    let tightest = 0;
    for (const corner of corners) {
      const relative: Vec3 = [
        corner[0] - fit.position[0],
        corner[1] - fit.position[1],
        corner[2] - fit.position[2],
      ];
      const ahead = -dot(relative, basis.back);
      expect(ahead).toBeGreaterThan(0);
      const nx = Math.abs(dot(relative, basis.right)) / ahead / tanH;
      const ny = Math.abs(dot(relative, basis.up)) / ahead / tanV;
      expect(nx).toBeLessThanOrEqual(1 + 1e-9);
      expect(ny).toBeLessThanOrEqual(1 + 1e-9);
      tightest = Math.max(tightest, nx, ny);
    }
    expect(tightest).toBeCloseTo(1, 6);
  });

  it("ignora puntos no finitos y devuelve null sin puntos", () => {
    expect(
      fitCameraToPoints([], [0, 0, 1], [0, 1, 0], {
        type: "orthographic",
        width: 100,
        height: 100,
      }),
    ).toBeNull();
    const fit = fitCameraToPoints(
      [[0, 0, 0], [1, 1, 0], [Number.NaN, 0, 0]],
      [0, 0, 1],
      [0, 1, 0],
      { type: "orthographic", width: 100, height: 100 },
    );
    expect(fit?.target[0]).toBeCloseTo(0.5, 9);
  });
});
