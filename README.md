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

## Estructura

```text
pymas-studio/
├── PYMAS_STUDIO_PLAN.md       # Plano maestro
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
