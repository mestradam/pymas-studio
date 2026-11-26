import { describe, expect, it } from "vitest";
import type { DistributedLoad, NodalLoad } from "../types/pymas";
import { hasReleases } from "./parser";
import { allFixtures, entityCount, loadFixture } from "./testUtils";

const fixtures = allFixtures();

function expectFiniteNodalLoad(load: NodalLoad): void {
  for (const value of Object.values(load)) expect(Number.isFinite(value)).toBe(true);
}

function expectFiniteDistributedLoad(load: DistributedLoad): void {
  expect(Number.isFinite(load.fx)).toBe(true);
  expect(Number.isFinite(load.fy)).toBe(true);
  expect(Number.isFinite(load.fz)).toBe(true);
}

describe("parser · auditoría de todos los fixtures", () => {
  it("encuentra los 12 archivos reales", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
    expect(fixtures.map((f) => f.file)).toContain("eiffel_tower.json");
    expect(fixtures.map((f) => f.file)).toContain("F3_analisis_reparacion.json");
  });

  for (const fixture of fixtures) {
    describe(fixture.file, () => {
      it("respeta metadatos, unidades y conteos del JSON real", () => {
        const { raw, model } = fixture;
        expect(model.meta.source).toBe(fixture.file);
        expect(model.meta.type).toBe(typeof raw.type === "string" ? raw.type : "space_frame");
        expect(model.meta.dofPerNode).toBe(model.meta.degreesOfFreedom.length);
        expect(model.meta.units).toEqual({ force: "kN", length: "m", stress: "kPa" });
        expect(model.meta.unitsAssumed).toBe(true); // ningún fixture declara units

        expect(model.stats.nodes).toBe(entityCount(raw.joints ?? raw.nodes));
        expect(model.stats.frames).toBe(entityCount(raw.frames));
        expect(model.stats.supports).toBe(entityCount(raw.supports));
        expect(model.stats.patterns).toBe(entityCount(raw.load_patterns));
        expect(model.stats.combinations).toBe(entityCount(raw.load_combinations));
        expect(model.stats.results).toBe(entityCount(raw.results));
        expect(model.nodeOrder).toHaveLength(model.stats.nodes);
        expect(model.frameOrder).toHaveLength(model.stats.frames);
      });

      it("normaliza nudos, barras, materiales y secciones sin referencias rotas", () => {
        const { model } = fixture;
        for (const node of Object.values(model.nodes)) {
          expect(node.id.length).toBeGreaterThan(0);
          expect(Number.isFinite(node.x)).toBe(true);
          expect(Number.isFinite(node.y)).toBe(true);
          expect(Number.isFinite(node.z)).toBe(true);
        }
        for (const frame of Object.values(model.frames)) {
          expect(model.nodes[frame.nodeI]).toBeDefined();
          expect(model.nodes[frame.nodeJ]).toBeDefined();
          expect(frame.nodeI).not.toBe(frame.nodeJ);
          expect(frame.length).toBeGreaterThan(0);
          expect(Number.isFinite(frame.length)).toBe(true);
          expect(Number.isFinite(frame.rollAngle)).toBe(true);
          expect(["exported", "computed"]).toContain(frame.localAxesSource);
          if (frame.materialId) expect(model.materials[frame.materialId]).toBeDefined();
          if (frame.sectionId) expect(model.sections[frame.sectionId]).toBeDefined();
        }
        for (const section of Object.values(model.sections)) {
          expect(Number.isFinite(section.dy)).toBe(true);
          expect(Number.isFinite(section.dz)).toBe(true);
          expect(section.dy).toBeGreaterThan(0);
          expect(section.dz).toBeGreaterThan(0);
        }
        for (const material of Object.values(model.materials)) {
          expect(Number.isFinite(material.E)).toBe(true);
          expect(Number.isFinite(material.G)).toBe(true);
          expect(Number.isFinite(material.nu)).toBe(true);
          expect(Number.isFinite(material.rho)).toBe(true);
        }
      });

      it("normaliza apoyos con los flags r_ux/r_uy/... reales", () => {
        const { model } = fixture;
        for (const support of Object.values(model.supports)) {
          expect(model.nodes[support.node]).toBeDefined();
          expect(support.translationCount).toBe(
            [support.ux, support.uy, support.uz].filter(Boolean).length,
          );
          expect(support.rotationCount).toBe(
            [support.rx, support.ry, support.rz].filter(Boolean).length,
          );
          expect(support.translationCount).toBeGreaterThan(0);
        }
      });

      it("normaliza todos los patrones y sus cargas", () => {
        const { model } = fixture;
        for (const pattern of Object.values(model.loadPatterns)) {
          expect(pattern.id.length).toBeGreaterThan(0);
          for (const [nodeId, load] of Object.entries(pattern.nodalLoads)) {
            expect(model.nodes[nodeId]).toBeDefined();
            expectFiniteNodalLoad(load);
          }
          for (const [frameId, loads] of Object.entries(pattern.frameLoads)) {
            expect(model.frames[frameId]).toBeDefined();
            expect(loads.length).toBeGreaterThan(0);
            for (const load of loads) expectFiniteDistributedLoad(load);
          }
        }
      });

      it("conserva o calcula las liberaciones/rótulas", () => {
        const { model } = fixture;
        const released = Object.values(model.frames).filter(hasReleases);
        if (fixture.file === "F3_analisis_reparacion.json") {
          expect(released.length).toBe(8);
          for (const frame of released) {
            expect(frame.releaseI.bending_z).toBe(true);
            expect(frame.releaseJ.bending_z).toBe(true);
            expect(frame.releaseI.torsion).toBe(true);
          }
        } else {
          expect(released.length).toBe(0);
        }
      });

      it("normaliza resultados y estaciones de todos los frames", () => {
        const { model } = fixture;
        for (const [patternId, result] of Object.entries(model.results)) {
          for (const nodeId of Object.keys(result.nodalDisplacements)) {
            expect(model.nodes[nodeId]).toBeDefined();
          }
          for (const nodeId of Object.keys(result.reactions)) {
            expect(model.nodes[nodeId]).toBeDefined();
          }
          for (const [frameId, frameResult] of Object.entries(result.frameResults)) {
            expect(model.frames[frameId]).toBeDefined();
            const { internalForces, internalDisplacements, endActions } = frameResult;
            expect(internalForces.stations.length).toBe(internalForces.fx.length);
            expect(internalForces.stations.length).toBe(internalForces.fy.length);
            expect(internalForces.stations.length).toBe(internalForces.mz.length);
            expect(internalDisplacements.stations.length).toBe(
              internalDisplacements.ux.length,
            );
            expect(internalDisplacements.stations.length).toBe(
              internalDisplacements.rz.length,
            );
            expect(internalForces.hasExplicitStations).toBe(true);
            expect(internalForces.stations[0]).toBe(0);
            expect(internalForces.stations[internalForces.stations.length - 1]).toBe(1);
            for (const value of [
              ...internalForces.fx,
              ...internalForces.fy,
              ...internalForces.fz,
              ...internalForces.mx,
              ...internalForces.my,
              ...internalForces.mz,
              ...internalDisplacements.ux,
              ...internalDisplacements.uy,
              ...internalDisplacements.uz,
              ...Object.values(endActions.i),
              ...Object.values(endActions.j),
            ]) {
              expect(Number.isFinite(value)).toBe(true);
            }
          }
          expect(result.nodalDisplacements).toBeTypeOf("object");
          expect(result.reactions).toBeTypeOf("object");
          expect(patternId.length).toBeGreaterThan(0);
        }
      });

      it("no reporta referencias estructurales rotas", () => {
        const structuralWarnings = fixture.model.warnings.filter((warning) =>
          /inexistente|no se encontraron|se omite|duplicado|no ortonormales|longitud distinta|no reconocido/i.test(
            warning,
          ),
        );
        expect(structuralWarnings).toEqual([]);
      });
    });
  }

  it("F3 resuelve las 17 combinaciones lineales y sus resultados precalculados", () => {
    const { model } = loadFixture("F3_analisis_reparacion.json");
    expect(model.stats.combinations).toBe(17);
    expect(model.loadCombinationOrder).toHaveLength(17);
    for (const combination of Object.values(model.loadCombinations)) {
      expect(combination.type).toBe("linear_add");
      expect(Object.keys(combination.factors).length).toBeGreaterThan(0);
      expect(model.results[combination.id]).toBeDefined();
    }
  });
});
