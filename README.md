# PyMAS Studio 3D

Visor web **100 % estático** para modelos estructurales exportados por
[`pymas`](https://github.com/). Renderiza la geometría en 3D con sistema de
coordenadas **Z-up**, secciones extruidas `dy × dz`, apoyos, rótulas, vectores de
carga y el balance de equilibrio global. No requiere backend: todo ocurre en el
navegador y el mismo `dist/` funciona en GitHub Pages, en cualquier subruta o en
un servidor local.

## Inicio rápido

```bash
cd web
npm install
npm run dev          # http://127.0.0.1:5173
```

El primer arranque carga `space_frame.json` como ejemplo. También puedes abrir un
modelo concreto con el parámetro `?model=`:

```
http://127.0.0.1:5173/?model=simple_beam.json
http://127.0.0.1:5173/?model=samples/eiffel_tower.json
http://127.0.0.1:5173/?model=https://ejemplo.com/modelo.json
```

Además, puedes arrastrar y soltar cualquier `.json` exportado por `pymas` sobre
la ventana, o usar el botón **Abrir JSON**.

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Sincroniza `fixtures/` y arranca Vite. |
| `npm test` | Ejecuta Vitest contra los JSON reales de `fixtures/`. |
| `npm run build` | Sincroniza ejemplos, valida TypeScript y genera `web/dist/`. |
| `npm run preview` | Sirve localmente el build de producción. |
| `npm run samples:sync` | Copia `fixtures/` a `web/public/samples/` y genera `manifest.json`. |

## Flujo de trabajo Git (Atlassian Gitflow)

El proyecto adopta el **Gitflow Workflow de Atlassian**
([referencia oficial](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)).
Se utiliza `main` como rama estable, equivalente a `master` en el artículo
original, y `develop` como rama de integración.

### Ramas permanentes

| Rama | Propósito | Reglas |
| --- | --- | --- |
| `main` | Código estable y desplegable. | Sólo recibe merges desde `release/*` y `hotfix/*`. Cada merge se etiqueta con una versión. Sin commits directos. |
| `develop` | Integración del trabajo en curso. | Recibe merges desde `feature/*` mediante Pull Request. Es la base para nuevas funcionalidades y releases. Sin commits directos. |

### Ramas de apoyo

| Rama | Se crea desde | Se integra en | Uso |
| --- | --- | --- | --- |
| `feature/<tema>` | `develop` | `develop` | Funcionalidades, mejoras y correcciones no urgentes. Vida corta. |
| `release/<version>` | `develop` | `main` y `develop` | Estabilización, pruebas finales y ajustes de versión. |
| `hotfix/<version>` | `main` | `main` y `develop` | Correcciones urgentes sobre una versión ya publicada. |

Los nombres deben ser descriptivos y en minúsculas, por ejemplo
`feature/inspector-barras`, `release/0.2.0` o `hotfix/0.1.1`.

### Ciclo de una funcionalidad

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/inspector-barras

# Desarrollo y commits atómicos
npm test
npm run build

git add .
git commit -m "feat: añadir inspector 2D de barras"
git push -u origin feature/inspector-barras
```

Después se abre un **Pull Request de `feature/inspector-barras` hacia
`develop`**. Una vez revisado, aprobado y con la integración continua en verde,
se fusiona con merge commit (`--no-ff`) y se elimina la rama de funcionalidad.

### Publicación de una versión

```bash
git switch -c release/0.2.0 develop
# Ajustes finales, pruebas y actualización de versión

git switch main
git merge --no-ff release/0.2.0
git tag -a v0.2.0 -m "PyMAS Studio 3D v0.2.0"

git switch develop
git merge --no-ff release/0.2.0
git branch -d release/0.2.0
git push origin main develop --tags
```

### Corrección urgente

```bash
git switch -c hotfix/0.2.1 main
# Corrección mínima y prueba de regresión

git switch main
git merge --no-ff hotfix/0.2.1
git tag -a v0.2.1 -m "PyMAS Studio 3D v0.2.1"

git switch develop
git merge --no-ff hotfix/0.2.1
git branch -d hotfix/0.2.1
git push origin main develop --tags
```

### Reglas de integración

* No hacer commits directamente en `main` ni en `develop`; todo cambio entra
  mediante Pull Request.
* Cada PR debe pasar `npm test` y `npm run build` antes de fusionarse.
* Las ramas `feature/*` pueden actualizarse con rebase sobre `develop` antes del
  PR si es necesario, pero **nunca** se reescribe el historial de `main` o
  `develop`.
* Usar merge commits (`--no-ff`) para conservar el contexto de cada rama.
* Cada release u hotfix debe actualizar la versión, generar su tag `vX.Y.Z` y
  volver a integrarse en `develop`.
* No versionar artefactos generados: `web/dist/`, `web/public/samples/`,
  `node_modules/` ni `__pycache__/`.
* Los mensajes de commit siguen Conventional Commits: `feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `chore:`.

### Estado actual de las ramas

* `main`: plano del proyecto y fixtures originales.
* `develop`: implementación de la Fase 1 y trabajo en curso.

## Estructura

```text
pymas-studio/
├── PYMAS_STUDIO_PLAN.md       # Plano maestro
├── LICENSE                    # Licencia MIT
├── fixtures/                  # 12 exportaciones reales de pymas
├── web/                       # React + TypeScript + Vite + Three.js
│   ├── public/samples/        # Generado en cada build (no versionado)
│   ├── scripts/sync-samples.mjs
│   └── src/
│       ├── types/pymas.ts     # Contrato crudo + modelo normalizado
│       ├── engine/            # parser, geometría, superposición, equilibrio
│       ├── store/             # Zustand
│       └── components/        # viewport 3D + UI
├── python/                    # Puente opcional para notebooks (`pymas_studio.show`)
└── .github/workflows/         # Despliegue a GitHub Pages
```

## Hallazgos de la auditoría de `fixtures/`

Los 12 archivos reales difieren del contrato inicial del plano. El parser acepta
ambos formatos y normaliza todo a un modelo interno:

* Nivel superior con `type` + `degrees_of_freedom` (no `model`).
* Nudos en `joints` (no `nodes`); `y`/`z` pueden faltar en modelos 2D.
* Barras con `joint_j` / `joint_k` (no `node_i` / `node_j`).
* Apoyos con `r_ux`, `r_uy`, … (no `ux`, `uy`, …).
* Patrones con `joints` / `frames`; cada carga trae su `joint` o `frame`.
* `end_actions` plano (`fx_j`, `fx_k`, …).
* `stations` opcionales: si faltan se usan `[0, 0.25, 0.5, 0.75, 1]`.
* No hay `units`, `nu`, `rho`, `releases` ni `type` en combinaciones.
* `load_combinations` sólo aparece en `F3_analisis_reparacion.json` y son lineales.
* Los `local_axes` exportados son autoritativos; se recalculan sólo si faltan.
* Las cargas distribuidas `fx/fy/fz` se interpretan como componentes **locales**;
  las nodales son **globales**. Esto es necesario para que el equilibrio cierre.
* `Section` (cerchas) no trae `dy`/`dz`; se deriva un tamaño visual desde `A`.
* F3 usa `MAT_E` (existente) y `MAT_N` (reforzamiento), con colores distintivos.

## Convenciones y controles

* **Z-up**: la grilla se dibuja en el plano `XY`.
* Vistas: isométrica, planta `XY`, elevación frontal `XZ` y lateral `YZ`.
* Cámara perspectiva/ortográfica con encuadre automático.
* Render alámbrico o extruido; color por material, sección o uniforme.
* Capas: nudos, etiquetas, apoyos, rótulas, cargas y grilla.
* Los vectores de carga se filtran por patrón activo y se autoescalan.
* La barra inferior verifica `ΣF` y `ΣM` contra las reacciones exportadas.

## Estado

* **Fase 1** (tipos, parser, geometría, superposición, equilibrio y Vitest):
  completada.
* Se adelantó el visor 3D base de la Fase 2 para poder inspeccionar los modelos
  (drag & drop, selector de ejemplos, vistas CAD, secciones, apoyos, rótulas y
  cargas).
* Pendiente para fases siguientes: deformada, diagramas de esfuerzos, reacciones
  en 3D, inspector 2D, combinaciones en la UI, comparador de fases y empaquetado
  final del puente Python.

## Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo
[`LICENSE`](LICENSE) para el texto completo.

Copyright © 2026 Martin Estrada Mejía.

