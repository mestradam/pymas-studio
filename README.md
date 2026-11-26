# PyMAS Studio 3D

Visor web **100 % estático** para modelos estructurales exportados por
[`pymas`](https://github.com/rvcristiand/pymas). Renderiza la geometría en 3D con sistema de
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
http://127.0.0.1:5173/?model=simple_beam.json&up=y
```

Además, puedes arrastrar y soltar cualquier `.json` exportado por `pymas` sobre
la ventana, o usar el botón **Abrir JSON**.

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Sincroniza `fixtures/` y arranca Vite. |
| `npm test` | Ejecuta Vitest contra los JSON reales de `fixtures/`. |
| `npm run build` | Sincroniza ejemplos, valida TypeScript y genera `web/dist/`. |
| `npm run build:python` | Copia `web/dist/` dentro de `python/pymas_studio/static/`. |
| `npm run package:python` | Compila y copia los estáticos en un solo paso. |
| `npm run preview` | Sirve localmente el build de producción. |
| `npm run samples:sync` | Copia `fixtures/` a `web/public/samples/` y genera `manifest.json`. |

## Despliegue web (GitHub Pages)

`vite.config.ts` usa `base: "./"`, por lo que el contenido de `web/dist/` es
portable a cualquier subruta. No hay backend ni recursos externos: modelos,
muestras y assets se sirven desde el mismo sitio estático.

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
compila `web/`, ejecuta las pruebas y publica `web/dist/` en GitHub Pages al
hacer push a `main` (también puede lanzarse manualmente con
`workflow_dispatch`). En el repositorio de GitHub habilita
**Settings → Pages → Source: GitHub Actions**.

La URL publicada admite los mismos parámetros que el entorno local:

```text
https://<usuario>.github.io/<repositorio>/
https://<usuario>.github.io/<repositorio>/?model=simple_beam.json
https://<usuario>.github.io/<repositorio>/?model=samples/eiffel_tower.json
https://<usuario>.github.io/<repositorio>/?model=https://ejemplo.com/modelo.json
```

## Paquete Python `pymas_studio`

El visor también puede abrirse desde un notebook o script de `pymas` con un
servidor local efímero. El paquete usa únicamente la biblioteca estándar.

```bash
# Desde la raíz del repositorio: compila, copia estáticos e instala editable
make install-python

# Alternativa sin make
cd web && npm install && npm run build && npm run build:python
cd .. && python3 -m pip install -e ./python
```

Uso desde cualquier carpeta del sistema:

```python
import pymas_studio

# Ruta a una exportación de pymas
pymas_studio.show("fixtures/F3_analisis_reparacion.json")

# Diccionario con el esquema pymas
pymas_studio.show(modelo_dict)

# Objeto de pymas con .to_dict() o .export_json()
pymas_studio.show(modelo)

# Puerto fijo, sin abrir el navegador (devuelve la URL)
url = pymas_studio.show(modelo, port=8765, open_browser=False)
print(url)  # http://127.0.0.1:8765/?model=model.json
```

`show()` sirve `web/dist/` (o `python/pymas_studio/static/` cuando el paquete
está empaquetado), expone el modelo en `/model.json` y abre
`http://127.0.0.1:<puerto>/?model=model.json`. El servidor corre en un hilo
daemon. Desde terminal:

```bash
python3 -m pymas_studio fixtures/space_frame.json
pymas-studio fixtures/space_frame.json   # consola instalada por el paquete
```

## Flujo de trabajo Git (Atlassian Gitflow)

El proyecto adopta el **Gitflow Workflow de Atlassian**
([referencia oficial](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)).
Se utiliza `main` como rama estable, equivalente a `master` en el artículo
original, y `develop` como rama de integración.

### Ramas permanentes

| Rama | Propósito | Reglas |
| --- | --- | --- |
| `main` | Código estable y desplegable. Cada push publica GitHub Pages. | Recibe merges **sólo** desde `release/*` y `hotfix/*`. Cada merge se etiqueta con su versión `vX.Y.Z`. Sin commits directos. |
| `develop` | Integración del trabajo en curso. | Recibe merges desde `feature/*` mediante Pull Request y la reintegración de `release/*` y `hotfix/*`. Es la base para nuevas funcionalidades y releases. Sin commits directos. |

### Ramas de apoyo

| Rama | Se crea desde | Se integra en | Uso |
| --- | --- | --- | --- |
| `feature/<tema>` | `develop` | `develop` | Funcionalidades, mejoras y correcciones no urgentes. Vida corta. |
| `release/<version>` | `develop` | `main` y `develop` | Estabilización, pruebas finales y ajustes de versión. |
| `hotfix/<version>` | `main` | `main` y `develop` (o la `release/*` abierta) | Correcciones urgentes sobre una versión ya publicada. |

Los nombres deben ser descriptivos y en minúsculas, por ejemplo
`feature/inspector-barras`, `release/0.3.0` o `hotfix/0.2.1`.

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
se fusiona con merge commit (`--no-ff`) y se elimina la rama de funcionalidad,
tanto local como remota:

```bash
git switch develop
git pull --ff-only origin develop
git branch -d feature/inspector-barras
git push origin --delete feature/inspector-barras   # si GitHub no la borró
git fetch --prune
```

### Publicación de una versión

`main` nunca recibe `develop` directamente: cada versión se estabiliza en una
rama `release/X.Y.Z`. En ella sólo entran correcciones, documentación y el
cambio de versión; las funcionalidades nuevas esperan a la siguiente release en
`develop`.

La versión se actualiza en estos cuatro archivos:

* `web/package.json` y `web/package-lock.json` (`npm version X.Y.Z --no-git-tag-version` desde `web/`)
* `python/pyproject.toml`
* `python/pymas_studio/__init__.py` (`__version__`)

```bash
git switch develop
git pull --ff-only origin develop
git switch -c release/0.3.0
# Actualizar versión, pruebas finales y correcciones menores
make test && make test-python && make build
git commit -am "chore: actualizar versión a 0.3.0"

git switch main
git pull --ff-only origin main
git merge --no-ff release/0.3.0 -m "merge: versión 0.3.0"
git tag -a v0.3.0 -m "PyMAS Studio 3D v0.3.0"

git switch develop
git merge --no-ff release/0.3.0
git push origin main develop --tags

git branch -d release/0.3.0
git push origin --delete release/0.3.0   # si se publicó la rama
```

### Corrección urgente

Un hotfix parte de `main` y sólo contiene la corrección mínima con su prueba de
regresión. Si existe una `release/*` abierta, el hotfix se integra en ella en
lugar de `develop`; la release lo llevará a `develop` al cerrarse.

```bash
git switch -c hotfix/0.2.1 main
# Corrección mínima, prueba de regresión y actualización de versión
git commit -am "fix: ..."

git switch main
git merge --no-ff hotfix/0.2.1 -m "merge: versión 0.2.1"
git tag -a v0.2.1 -m "PyMAS Studio 3D v0.2.1"

git switch develop        # o la release/* abierta
git merge --no-ff hotfix/0.2.1
git push origin main develop --tags

git branch -d hotfix/0.2.1
git push origin --delete hotfix/0.2.1    # si se publicó la rama
```

### Reglas de integración

* No hacer commits directamente en `main` ni en `develop`; todo cambio entra
  mediante Pull Request.
* Cada PR debe pasar `npm test` y `npm run build` antes de fusionarse.
* Las ramas `feature/*` pueden actualizarse con rebase sobre `develop` antes del
  PR si es necesario, pero **nunca** se reescribe el historial de `main` o
  `develop`.
* Usar merge commits (`--no-ff`) para conservar el contexto de cada rama.
* Sólo las ramas `release/*` y `hotfix/*` cambian la versión; cada una genera
  su tag `vX.Y.Z` en `main` y vuelve a integrarse en `develop`.
* Las ramas de apoyo se eliminan (local y remota) en cuanto se fusionan.
* No versionar artefactos generados: `web/dist/`, `web/public/samples/`,
  `node_modules/` ni `__pycache__/`.
* Los mensajes de commit siguen Conventional Commits: `feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `chore:`.

### Estado actual de las ramas

* `main`: v0.2.0, desplegada en GitHub Pages.
* `develop`: al día con `main`; la próxima versión saldrá por una rama
  `release/*`.

## Estructura

```text
pymas-studio/
├── LICENSE                    # Licencia MIT
├── fixtures/                  # 12 exportaciones reales de pymas
├── Makefile                   # Atajos: build, tests, estáticos y paquete Python
├── web/                       # React + TypeScript + Vite + Three.js
│   ├── public/samples/        # Generado en cada build (no versionado)
│   ├── scripts/sync-samples.mjs
│   ├── scripts/sync-python-static.mjs
│   └── src/
│       ├── types/pymas.ts     # Contrato crudo + modelo normalizado
│       ├── engine/            # parser, geometría, superposición, diagramas, equilibrio
│       ├── store/             # Zustand
│       └── components/        # viewport 3D + UI
├── python/                    # Paquete `pymas_studio` y puente HTTP local
│   ├── pyproject.toml
│   ├── pymas_studio/
│   │   ├── server.py          # show() + ThreadingHTTPServer estándar
│   │   └── static/            # Copia de web/dist al empaquetar (no versionada)
│   └── tests/test_server.py
└── .github/workflows/         # Despliegue a GitHub Pages (`deploy.yml`)
```

## Convenciones y controles

* **Z-up** por defecto: la grilla se dibuja en el plano `XY`.
* **Eje vertical intercambiable** (`X↑`, `Y↑`, `Z↑`) desde el panel lateral o
  con `?up=x|y|z` en la URL; la elección se recuerda en el navegador. El modelo
  se rota en bloque (permutación cíclica de ejes, sin espejos); la grilla, las
  vistas CAD, el gizmo, los apoyos y la deriva del mapa de calor siguen al eje
  elegido.
* Vistas: isométrica, planta, elevación frontal y lateral. Con `Z↑` son `XY`,
  `XZ` y `YZ`; con `Y↑`, `ZX`, `ZY` y `XY`; con `X↑`, `YZ`, `YX` y `ZX`.
* Cámara perspectiva/ortográfica con encuadre automático.
* Render alámbrico o extruido; color por material, sección o uniforme.
* Capas: nudos, etiquetas, apoyos, rótulas, cargas y grilla.
* Los vectores de carga se filtran por patrón activo y se autoescalan.
* Casos de resultado: patrón exportado, combinación calculada en vivo y
  envolventes `ENV_MAX`/`ENV_MIN` sobre las combinaciones activas.
* Deformada elástica por Hermite con escala automática/amplificable, estructura
  fantasma, animación armónica y mapa de calor `|U|`, `ux`, `uy`, `uz` o deriva.
* Diagramas 3D de `Fx…Mz` en sus planos locales, con relleno por signo y
  etiquetas en los extremos; reacciones en apoyos con `ΣFx`, `ΣFy`, `ΣFz`.
* **Selección interactiva** por clic sobre barras y nudos (modo alámbrico y
  extruido), con resaltado luminoso y cierre con `Esc` o clic en vacío.
* **Inspector de elemento** en panel lateral: ficha técnica, liberaciones,
  `end_actions` I/J, desplazamiento y reacción nodales, y siete gráficos SVG
  (`Fx`, `Fy`, `Fz`, `Mx`, `My`, `Mz` y deflexión local). El cursor de los
  gráficos está sincronizado entre sí y proyecta un marcador naranja sobre la
  barra 3D (sobre la deformada si está activa).
* **Tablas de resultados** filtrables y ordenables: desplazamientos nodales,
  reacciones en apoyos y máximos absolutos por barra, con filtros por material,
  sección o tipo de apoyo. Cada fila abre el inspector del elemento en el visor.
* La barra inferior verifica `ΣF` y `ΣM` contra las reacciones del caso activo.
* El motor `engine/diagrams.ts` entrega diagramas listos para dibujar: estaciones,
  puntos indeformados, ordenadas en ejes locales, picos, interpolación para el
  cursor y auto-escala. Sus pruebas comparan todos los fixtures, las 17
  combinaciones de F3 y las envolventes contra los datos reales.

## Estado

* **Fase 1** (tipos, parser, geometría, superposición, equilibrio y Vitest):
  completada.
* **Fase 2** (viewport 3D Z-up, drag & drop, selector de ejemplos, vistas CAD,
  cubo de orientación, secciones extruidas, colores, apoyos, rótulas, cargas,
  deformada con mapa de calor, combinaciones/envolventes en vivo, diagramas 3D
  y reacciones): completada.
* **Validación de diagramas**: `engine/diagrams.ts`, `engine/deformation.ts` y sus
  pruebas unitarias verifican estaciones, proyección en ejes locales, picos,
  convención de extremos, interpolación de Hermite, combinaciones lineales y
  envolventes contra los 12 fixtures reales.
* **Inspector 2D y tablas de resultados** (Fase 4 del plan): completados con
  selección por raycasting, gráficos sincronizados con el marcador 3D, ficha de
  barras y nudos y tablas filtrables/ordenables.
* **Comparador y entregables** (Fase 5 del plan): comparador A/B de modelos o
  fases con cámaras sincronizadas (superposición y división), mapa de calor de
  demandas y exportación de PNG de alta resolución (fondo oscuro o blanco) y CSV
  de reacciones y envolventes.
* **Despliegue y paquete Python** (Fase 5 del plan): build portable para GitHub
  Pages con workflow automático, carga por `?model=` y paquete `pymas_studio`
  basado sólo en la biblioteca estándar que sirve el visor y el modelo local.

## Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo
[`LICENSE`](LICENSE) para el texto completo.

Copyright © 2026 Martin Estrada Mejía.
