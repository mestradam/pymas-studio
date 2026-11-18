import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { PymasJson, PymasModel } from "../types/pymas";
import { parsePymasJson } from "./parser";

function resolveFixturesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "fixtures"),
    path.resolve(process.cwd(), "fixtures"),
    path.resolve(process.cwd(), "..", "..", "fixtures"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No se encontró la carpeta fixtures/. Buscado en:\n${candidates.join("\n")}`,
  );
}

export const FIXTURES_DIR = resolveFixturesDir();

export const FIXTURE_FILES = readdirSync(FIXTURES_DIR)
  .filter((file) => file.toLowerCase().endsWith(".json"))
  .sort((a, b) => a.localeCompare(b));

export interface Fixture {
  file: string;
  text: string;
  raw: PymasJson;
  model: PymasModel;
}

const cache = new Map<string, Fixture>();

export function loadFixture(file: string): Fixture {
  const cached = cache.get(file);
  if (cached) return cached;
  const text = readFileSync(path.join(FIXTURES_DIR, file), "utf8");
  const raw = JSON.parse(text) as PymasJson;
  const model = parsePymasJson(text, file);
  const fixture: Fixture = { file, text, raw, model };
  cache.set(file, fixture);
  return fixture;
}

export function allFixtures(): Fixture[] {
  return FIXTURE_FILES.map(loadFixture);
}

export function entityCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

export function closeTo(
  actual: number,
  expected: number,
  absolute = 1e-9,
  relative = 1e-9,
): boolean {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1);
  return Math.abs(actual - expected) <= absolute + relative * scale;
}
