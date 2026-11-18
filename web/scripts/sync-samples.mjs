#!/usr/bin/env node
/**
 * Synchronise the repository `fixtures/` directory into the static
 * `web/public/samples/` folder and generate `manifest.json`.
 *
 * The application is a zero-backend SPA: samples are plain static JSON files
 * fetched with relative URLs, so this script is the only "build integration"
 * between the real pymas exports and the web app.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(webDir, "..");
const fixturesDir = path.join(repoDir, "fixtures");
const samplesDir = path.join(webDir, "public", "samples");

const PREFERRED_ORDER = [
  "simple_beam.json",
  "simple_bar.json",
  "fixed_beam.json",
  "propped_beam.json",
  "cantilever_beam.json",
  "continuous_beam.json",
  "overhanging_beam.json",
  "space_frame.json",
  "space_truss.json",
  "space_truss_nodal_load.json",
  "F3_analisis_reparacion.json",
  "eiffel_tower.json",
];

const LABELS = {
  "simple_beam.json": "Viga simplemente apoyada",
  "simple_bar.json": "Barra axial",
  "fixed_beam.json": "Viga biempotrada",
  "propped_beam.json": "Viga apoyada-apuntalada",
  "cantilever_beam.json": "Viga en voladizo",
  "continuous_beam.json": "Viga continua",
  "overhanging_beam.json": "Viga con voladizos",
  "space_frame.json": "Pórtico espacial",
  "space_truss.json": "Cercha espacial",
  "space_truss_nodal_load.json": "Cercha espacial con carga nodal",
  "F3_analisis_reparacion.json": "Fase 3 · Análisis y reparación",
  "eiffel_tower.json": "Torre Eiffel (cercha espacial)",
};

function orderIndex(file) {
  const i = PREFERRED_ORDER.indexOf(file);
  return i === -1 ? PREFERRED_ORDER.length : i;
}

function entityCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function normalizeType(raw) {
  return typeof raw?.type === "string" ? raw.type : "space_frame";
}

async function main() {
  if (!existsSync(fixturesDir)) {
    throw new Error(`No existe la carpeta de fixtures: ${fixturesDir}`);
  }

  const all = await readdir(fixturesDir);
  const files = all.filter((f) => f.toLowerCase().endsWith(".json")).sort((a, b) => {
    const byOrder = orderIndex(a) - orderIndex(b);
    return byOrder !== 0 ? byOrder : a.localeCompare(b);
  });

  if (files.length === 0) {
    throw new Error("No hay archivos .json dentro de fixtures/");
  }

  await rm(samplesDir, { recursive: true, force: true });
  await mkdir(samplesDir, { recursive: true });

  const samples = [];
  for (const file of files) {
    const source = path.join(fixturesDir, file);
    const rawText = await readFile(source, "utf8");
    let raw;
    try {
      raw = JSON.parse(rawText);
    } catch (error) {
      throw new Error(`El fixture ${file} no es JSON válido: ${String(error)}`);
    }

    await copyFile(source, path.join(samplesDir, file));
    samples.push({
      file,
      label: LABELS[file] ?? file.replace(/\.json$/i, "").replace(/[_-]+/g, " "),
      name: file.replace(/\.json$/i, ""),
      type: normalizeType(raw),
      nodes: entityCount(raw?.joints ?? raw?.nodes),
      frames: entityCount(raw?.frames),
      supports: entityCount(raw?.supports),
      patterns: entityCount(raw?.load_patterns),
      combinations: entityCount(raw?.load_combinations),
      sizeBytes: Buffer.byteLength(rawText, "utf8"),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "fixtures/",
    samples,
  };
  await writeFile(path.join(samplesDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `[samples] ${samples.length} modelos sincronizados en public/samples (${(
      samples.reduce((acc, s) => acc + s.sizeBytes, 0) /
      (1024 * 1024)
    ).toFixed(1)} MB)`,
  );
}

main().catch((error) => {
  console.error("[samples] Error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
