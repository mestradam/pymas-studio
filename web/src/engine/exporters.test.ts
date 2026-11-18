import { describe, expect, it } from "vitest";
import type { PatternResultData, PymasModel } from "../types/pymas";
import { compareModels } from "./comparison";
import {
  comparisonCsv,
  csvNumber,
  frameForcesCsv,
  nodalDisplacementsCsv,
  reactionsCsv,
  toCsv,
} from "./exporters";
import { loadFixture } from "./testUtils";

function firstResult(model: PymasModel): PatternResultData {
  const resultId = model.resultOrder[0] ?? Object.keys(model.results)[0];
  const result = resultId ? model.results[resultId] : undefined;
  if (!result) throw new Error("El fixture no tiene resultados.");
  return result;
}

describe("exportadores CSV", () => {
  it("escapa comas, comillas y saltos de línea", () => {
    const csv = toCsv([
      ["a", "b,c", 'd"e', "f\ng"],
      [1, null, undefined, "ok"],
    ]);
    expect(csv).toBe('a,"b,c","d""e","f\ng"\n1,,,ok\n');
  });

  it("formatea números finitos sin ruido de coma flotante", () => {
    expect(csvNumber(1.2345678901234)).toBe("1.23456789");
    expect(csvNumber(0)).toBe("0");
    expect(csvNumber(Number.NaN)).toBe("");
    expect(csvNumber(null)).toBe("");
    expect(csvNumber(1e-9)).toBe("1e-9");
  });

  it("exporta desplazamientos y reacciones con todas las filas", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const result = firstResult(model);
    const displacements = nodalDisplacementsCsv(model, result, "Modelo A");
    const reactions = reactionsCsv(model, result, "Modelo A");

    expect(displacements.split("\n")[0]).toBe("modelo,Modelo A");
    expect(displacements).toContain("node,name");
    expect(displacements).toContain("|u|");
    expect(displacements.trim().split("\n")).toHaveLength(
      model.nodeOrder.length + 3,
    );

    expect(reactions).toContain("support,node,node_name,kind");
    expect(reactions).toContain("|M|");
    expect(reactions.trim().split("\n")).toHaveLength(
      Object.keys(model.supports).length + 3,
    );
  });

  it("exporta los máximos por barra y el comparativo A/B", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    const result = firstResult(model);
    const frames = frameForcesCsv(model, result, "Modelo A");
    expect(frames).toContain("frame,name,material,section");
    expect(frames.trim().split("\n")).toHaveLength(
      model.frameOrder.length + 3,
    );

    const comparison = compareModels(model, result, model, result);
    const csv = comparisonCsv(comparison, {
      modelALabel: "Modelo A",
      modelBLabel: "Modelo B",
      caseLabel: "Patrón D",
    });
    expect(csv).toContain("Comparación de modelos PyMAS Studio 3D");
    expect(csv).toContain("modelo_A,Modelo A");
    expect(csv).toContain("modelo_B,Modelo B");
    expect(csv).toContain("caso,Patrón D");
    expect(csv).toContain("Resumen");
    expect(csv).toContain("desplazamiento_máximo");
    expect(csv).toContain("Desplazamientos nodales");
    expect(csv).toContain("Reacciones en apoyos");
    expect(csv).toContain("Barras comunes");
    expect(csv).toContain("demanda_%");
    expect(csv.trim().split("\n").length).toBeGreaterThan(
      comparison.nodes.length + comparison.frames.length,
    );
  });
});
