import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const dist = path.join(repoRoot, "web", "dist");
const target = path.join(repoRoot, "python", "pymas_studio", "static");

async function hasIndexHtml(directory) {
  try {
    return (await stat(path.join(directory, "index.html"))).isFile();
  } catch {
    return false;
  }
}

if (!(await hasIndexHtml(dist))) {
  console.error(
    "[python] No existe web/dist/index.html. Ejecuta primero `npm run build`.",
  );
  process.exit(1);
}

await mkdir(target, { recursive: true });
for (const entry of await readdir(target)) {
  // El README marca el directorio en git; los estáticos son artefactos.
  if (entry === "README.md") continue;
  await rm(path.join(target, entry), { recursive: true, force: true });
}
await cp(dist, target, { recursive: true });

console.log(
  `[python] Estáticos copiados: ${path.relative(repoRoot, dist)} -> ${path.relative(
    repoRoot,
    target,
  )}`,
);
