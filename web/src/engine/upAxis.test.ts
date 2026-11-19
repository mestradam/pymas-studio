import { describe, expect, it } from "vitest";
import type { Vec3 } from "./geometry";
import {
  UP_AXES,
  horizontalAxisIndices,
  isUpAxis,
  nextUpAxis,
  modelToView,
  modelToViewMatrix,
  presetForPlane,
  upAxisIndex,
  viewAxisNames,
  viewPlaneLabel,
  viewToModel,
} from "./upAxis";

function determinant(m: number[][]): number {
  const [a, b, c] = m as [number[], number[], number[]];
  return (
    a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
    a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
    a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)
  );
}

function multiply(m: number[][], v: Vec3): Vec3 {
  return m.map((row) => row[0]! * v[0] + row[1]! * v[1] + row[2]! * v[2]) as Vec3;
}

describe("eje vertical del visor", () => {
  it("Z-up es la identidad", () => {
    expect(modelToView([1, 2, 3], "z")).toEqual([1, 2, 3]);
    expect(viewPlaneLabel("plan", "z")).toBe("XY");
    expect(viewPlaneLabel("front", "z")).toBe("XZ");
    expect(viewPlaneLabel("side", "z")).toBe("YZ");
  });

  it.each(UP_AXES)("el eje %s del modelo queda vertical en la vista", (up) => {
    const unit: Vec3 = [0, 0, 0];
    unit[upAxisIndex(up)] = 1;
    expect(modelToView(unit, up)).toEqual([0, 0, 1]);
    expect(viewAxisNames(up)[2]).toBe(up.toUpperCase());
    expect(horizontalAxisIndices(up)).not.toContain(upAxisIndex(up));
  });

  it.each(UP_AXES)("la rotación con up=%s es propia y coincide con modelToView", (up) => {
    const matrix = modelToViewMatrix(up);
    expect(determinant(matrix)).toBe(1);
    const point: Vec3 = [1.5, -2, 7];
    expect(multiply(matrix, point)).toEqual(modelToView(point, up));
    expect(viewToModel(modelToView(point, up), up)).toEqual(point);
  });

  it("las vistas CAD siempre incluyen el eje vertical en las elevaciones", () => {
    for (const up of UP_AXES) {
      const upper = up.toUpperCase();
      expect(viewPlaneLabel("plan", up)).not.toContain(upper);
      expect(viewPlaneLabel("front", up).endsWith(upper)).toBe(true);
      expect(viewPlaneLabel("side", up).endsWith(upper)).toBe(true);
    }
  });

  it("encuentra la vista que muestra el plano XY", () => {
    expect(presetForPlane("X", "Y", "z")).toBe("plan");
    expect(presetForPlane("X", "Y", "x")).toBe("front");
    expect(presetForPlane("X", "Y", "y")).toBe("side");
  });

  it("el botón compacto recorre Z → X → Y → Z", () => {
    expect(nextUpAxis("z")).toBe("x");
    expect(nextUpAxis("x")).toBe("y");
    expect(nextUpAxis("y")).toBe("z");
  });

  it("valida valores persistidos", () => {
    expect(isUpAxis("y")).toBe(true);
    expect(isUpAxis("Y")).toBe(false);
    expect(isUpAxis(null)).toBe(false);
  });
});
