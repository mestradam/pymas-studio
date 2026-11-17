# PyMAS Studio 3D — Plano de Arquitectura y Desarrollo con Agente

## 1. Visión General y Modos de Despliegue

**PyMAS Studio 3D** es un entorno web interactivo de pre-proceso y post-proceso estructural diseñado para visualizar, inspeccionar y validar modelos tridimensionales resueltos por el motor de análisis matricial **`pymas`**.

El proyecto sintetiza dos aprendizajes previos:

1. La ligereza y portabilidad web de un visor basado en navegador (`mas.js`), superando su limitación puramente alámbrica.
2. La exploración paramétrica e interactiva en tiempo real (`paramele`), generalizándola a cualquier topología espacial arbitraria (`space_frame` de 6 grados de libertad por nudo).

### Arquitectura Dual de Despliegue (Zero-Backend + Integración Python)

El sistema debe soportar dos modos de operación con el **mismo código fuente frontend**:

1. **Modo Web Estático (GitHub Pages — Zero-Backend):**
   * Compilado como SPA estática hospedada en GitHub Pages (`https://<usuario>.github.io/pymas-studio/`).
   * Permite **arrastrar y soltar (Drag & Drop)** cualquier archivo `.json` producido por `pymas` directamente sobre el navegador, sin subir datos a ningún servidor (todo el cálculo de combinaciones, deformadas y diagramas ocurre 100% en el cliente).
   * Incluye un selector de modelos de demostración precargados (`public/samples/`) para docencia y difusión inmediata.
2. **Modo Local Integrado con Python (`pymas_studio.show()`):**
   * Empaquetado como un paquete Python ligero e instalable (`pip install -e ./python`) que contiene el *build* estático del visor.
   * Permite abrir cualquier modelo directamente desde un script o notebook de `pymas` mediante `pymas_studio.show(modelo)`, levantando un servidor HTTP efímero en `localhost` y abriendo el navegador automáticamente con el modelo ya cargado.

---

## 2. Estructura del Repositorio (`pymas-studio/`)

Para evitar conflictos entre las convenciones de JavaScript/TypeScript y Python, y permitir que `pymas` se conecte sin depender de rutas absolutas en disco, el proyecto adopta esta estructura de monorepo ligero:

```text
pymas-studio/
├── PYMAS_STUDIO_PLAN.md              # Este plano maestro para el agente
├── fixtures/                         # Archivos JSON reales provistos por el autor (VER SECCIÓN 3)
│   └── *.json
├── web/                              # Aplicación Frontend (React + TypeScript + Three.js)
│   ├── public/
│   │   └── samples/                  # Copia sincronizada de fixtures para GitHub Pages
│   ├── src/
│   │   ├── types/
│   │   │   └── pymas.ts              # Interfaces TypeScript estrictas del JSON
│   │   ├── engine/
│   │   │   ├── parser.ts             # Validación, normalización y valores por defecto
│   │   │   ├── geometry.ts           # Transformaciones globales/locales, ejes y extrusión
│   │   │   ├── superposition.ts      # Cálculo en vivo de combinaciones lineales y envolventes
│   │   │   └── equilibrium.ts        # Sumatoria de cargas aplicadas vs. reacciones
│   │   ├── store/
│   │   │   └── useModelStore.ts      # Estado global (modelo, caso activo, escalas, filtros)
│   │   ├── components/
│   │   │   ├── viewport/
│   │   │   │   ├── SceneCanvas.tsx       # Escena Three.js Z-up, luces, cámara CAD, grilla
│   │   │   │   ├── FrameMesh.tsx         # Renderizado dual (alámbrico y extruido dy x dz)
│   │   │   │   ├── NodeMarkers.tsx       # Nudos, apoyos 3D y etiquetas
│   │   │   │   ├── ReleaseMarkers.tsx    # Rótulas/articulaciones en extremos liberados
│   │   │   │   ├── LoadVectors.tsx       # Flechas de cargas nodales y distribuidas
│   │   │   │   ├── DeformedStructure.tsx # Elástica curva (5+ estaciones) y mapa de calor
│   │   │   │   ├── ForceDiagrams3D.tsx   # Diagramas 3D de Fx, Fy, Fz, Mx, My, Mz
│   │   │   │   └── ReactionVectors.tsx   # Vectores de reacción en apoyos
│   │   │   ├── inspector/
│   │   │   │   ├── ElementInspector.tsx     # Panel lateral al seleccionar barra o nudo
│   │   │   │   └── InternalForceChart2D.tsx # Gráfico 2D SVG sincronizado con la barra 3D
│   │   │   └── ui/
│   │   │       ├── DropZoneOverlay.tsx   # Zona global Drag & Drop para archivos .json
│   │   │       ├── TopToolbar.tsx        # Carga de JSON, selector de samples, vistas CAD
│   │   │       ├── ControlSidebar.tsx    # Selector de patrón/combinación, escalas y capas
│   │   │       └── EquilibriumBar.tsx    # Barra inferior con balance global y derivas
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts                # Configurado con base relativa ("./") para GitHub Pages
├── python/                           # Paquete puente instalable en cualquier entorno Python
│   ├── pyproject.toml
│   └── pymas_studio/
│       ├── __init__.py               # Expone show(model_or_path, port=0, open_browser=True)
│       ├── server.py                 # Servidor HTTP local en hilo daemon + endpoint /api/model.json
│       └── static/                   # Destino del build de web/dist/
└── .github/
    └── workflows/
        └── deploy-pages.yml          # Despliegue automático de web/dist a GitHub Pages
```

### Stack Tecnológico

* **Core & Build:** React 18 + TypeScript + Vite
* **Motor Gráfico 3D:** Three.js a través de `@react-three/fiber` y `@react-three/drei`
* **Gestión de Estado:** Zustand
* **Interfaz y Estilos:** Tailwind CSS + Lucide React
* **Testing Matemático:** Vitest (ejecutando pruebas contra los archivos en `fixtures/`)
* **Gráficos 2D (Inspector de Barra):** SVG nativo controlado por React

---

## 3. Regla Previa Obligatoria para el Agente (Inspección de `fixtures/`)

**INSTRUCCIÓN CRÍTICA ANTES DE ESCRIBIR CÓDIGO:**

1. La carpeta `fixtures/` en la raíz del repositorio contiene archivos `.json` reales exportados directamente por `pymas`.
2. **Antes de implementar el parser o los tipos**, el agente DEBE inspeccionar todos los archivos `.json` presentes en `fixtures/` para verificar:
   * Nombres exactos de claves y posibles variaciones entre modelos (por ejemplo, diccionarios vs. listas, presencia o ausencia de `releases`, `load_combinations`, `units`, `roll_angle`, o tipos de secciones).
   * Convenciones de signos reales en `end_actions`, `internal_forces`, `internal_displacements` y `reactions`.
3. Todos los archivos encontrados en `fixtures/` deben utilizarse como:
   * **Suite de pruebas automatizadas (`Vitest`)** en la Fase 1 para validar que el parser, la superposición lineal y el equilibrio estático funcionan sin errores sobre datos reales de `pymas`.
   * **Modelos de ejemplo** en `web/public/samples/` (generando un `manifest.json` automático al compilar) para que puedan abrirse con un clic tanto en desarrollo como en GitHub Pages.

---

## 4. Contrato de Datos (Esquema JSON de `pymas`)

El agente debe implementar el siguiente contrato TypeScript, ajustándolo si en `fixtures/` detecta alguna propiedad adicional de `pymas`:

```typescript
export interface PymasUnits {
  force: string;   // Por defecto: "kN"
  length: string;  // Por defecto: "m"
  stress: string;  // Por defecto: "kPa"
}

export interface NodeData {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface SupportData {
  ux: boolean;
  uy: boolean;
  uz: boolean;
  rx: boolean;
  ry: boolean;
  rz: boolean;
}

export interface MaterialData {
  id: string;
  name: string;
  E: number;
  G: number;
  nu: number;
  rho: number;
}

export interface SectionData {
  id: string;
  name: string;
  type: "RectangularSection" | string;
  dy: number; // Dimensión a lo largo del eje local y
  dz: number; // Dimensión a lo largo del eje local z
  A: number;
  Iy: number;
  Iz: number;
  J: number;
}

export interface ReleaseData {
  id: string;
  name: string;
  axial: boolean;
  shear_y: boolean;
  shear_z: boolean;
  torsion: boolean;
  bending_y: boolean;
  bending_z: boolean;
}

export interface DistributedLoad {
  type: "DistributedLoad" | string;
  direction?: "global_x" | "global_y" | "global_z" | "local_x" | "local_y" | "local_z";
  wx?: number;
  wy?: number;
  wz?: number;
}

export interface FrameData {
  id: string;
  node_i: string;      // El parser debe aceptar también alias si existen en fixtures
  node_j: string;
  material: string;
  section: string;
  release?: string | null;
  roll_angle?: number; // Opcional (en radianes o grados según convención), por defecto 0
  loads?: DistributedLoad[];
}

export interface NodalLoad {
  fx?: number;
  fy?: number;
  fz?: number;
  mx?: number;
  my?: number;
  mz?: number;
}

export interface LoadPatternData {
  id: string;
  name?: string;
  nodal_loads?: Record<string, NodalLoad>;
  frame_loads?: Record<string, DistributedLoad[]>;
}

export interface LoadCombinationData {
  id: string;
  name?: string;
  type: "linear_add" | "envelope";
  factors: Record<string, number>; // Ej: { "D": 1.2, "Lr": 1.6 }
}

export interface Vector6D {
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

export interface Displacement6D {
  ux: number;
  uy: number;
  uz: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface FrameStationForces {
  stations?: number[]; // Si se omite, se asume equidistante [0, 0.25, 0.5, 0.75, 1.0]
  fx: number[];
  fy: number[];
  fz: number[];
  mx: number[];
  my: number[];
  mz: number[];
}

export interface FrameStationDisplacements {
  stations?: number[];
  ux: number[];
  uy: number[];
  uz: number[];
  rx?: number[];
  ry?: number[];
  rz?: number[];
}

export interface FrameResultData {
  end_actions: {
    i: Vector6D;
    j: Vector6D;
  };
  internal_forces: FrameStationForces;
  internal_displacements: FrameStationDisplacements;
}

export interface PatternResultData {
  nodal_displacements: Record<string, Displacement6D>;
  reactions: Record<string, Vector6D>;
  frame_results: Record<string, FrameResultData>;
}

export interface PymasModel {
  model: {
    name?: string;
    type: "space_frame" | string;
    dof_per_node: number;
  };
  units?: PymasUnits;
  nodes: Record<string, NodeData> | NodeData[];
  supports: Record<string, SupportData>;
  materials: Record<string, MaterialData>;
  sections: Record<string, SectionData>;
  releases?: Record<string, ReleaseData>;
  frames: Record<string, FrameData> | FrameData[];
  load_patterns: Record<string, LoadPatternData>;
  load_combinations?: Record<string, LoadCombinationData>;
  results: Record<string, PatternResultData>;
}
```

---

## 5. Convenciones Geométricas y Motor Matemático (Reglas Críticas)

### 5.1 Sistema de Coordenadas Global ($Z$-up)

* **`pymas` utiliza un sistema derecho con eje $Z$ vertical hacia arriba ($Z$-up):** El plano $XY$ es la planta estructural y $Z$ es la cota de elevación.
* **Regla de Implementación en Three.js:** No intercambiar manualmente coordenadas $Y$ y $Z$ en los componentes. Configurar globalmente `THREE.Object3D.DEFAULT_UP.set(0, 0, 1)` y `camera.up.set(0, 0, 1)` al inicializar la escena, trabajando directamente en coordenadas nativas $(X, Y, Z)$ de `pymas`.

### 5.2 Ejes Locales de Barra $(x, y, z)$

Para cada barra definida desde el nudo inicial $I(X_i, Y_i, Z_i)$ hasta el nudo final $J(X_j, Y_j, Z_j)$ de longitud $L = \Vert \mathbf{P}_j - \mathbf{P}_i \Vert$:

* **Eje local $x$ ($\hat{\mathbf{e}}_x$):**
  $$\hat{\mathbf{e}}_x = \frac{\mathbf{P}_j - \mathbf{P}_i}{L}$$

* **Convención estándar para ejes locales $y$ ($\hat{\mathbf{e}}_y$) y $z$ ($\hat{\mathbf{e}}_z$) cuando $\text{roll\_angle} = 0$:**
  * **Caso General (vigas horizontales o inclinadas donde $|\hat{\mathbf{e}}_x \cdot \hat{\mathbf{K}}| < 0.999$, siendo $\hat{\mathbf{K}} = (0, 0, 1)$):**
    $$\hat{\mathbf{e}}_y = \frac{\hat{\mathbf{K}} \times \hat{\mathbf{e}}_x}{\Vert \hat{\mathbf{K}} \times \hat{\mathbf{e}}_x \Vert}, \qquad \hat{\mathbf{e}}_z = \hat{\mathbf{e}}_x \times \hat{\mathbf{e}}_y$$
  * **Caso Columna Vertical ($|\hat{\mathbf{e}}_x \cdot \hat{\mathbf{K}}| \ge 0.999$):**
    $$\hat{\mathbf{e}}_y = (0, 1, 0), \qquad \hat{\mathbf{e}}_z = \hat{\mathbf{e}}_x \times \hat{\mathbf{e}}_y$$
  * **Rotación por `roll_angle` ($\psi$):** Rotar $\hat{\mathbf{e}}_y$ y $\hat{\mathbf{e}}_z$ alrededor de $\hat{\mathbf{e}}_x$ mediante la fórmula de rotación de Rodrigues.

* **Extrusión de Sección:** La dimensión `section.dy` se proyecta a lo largo de $\hat{\mathbf{e}}_y$ y `section.dz` a lo largo de $\hat{\mathbf{e}}_z$.

### 5.3 Motor de Superposición en el Cliente

El archivo JSON contiene resultados únicamente para los patrones base (`load_patterns`). Para cualquier combinación $C$ con factores $\alpha_k$:

* **Combinación Lineal (`linear_add`):**
  $$R_C = \sum_{k} \alpha_k \, R_k$$
  Aplicado tensorialmente a desplazamientos nodales, reacciones, acciones en extremos, fuerzas internas en estaciones y desplazamientos internos en estaciones.
* **Envolvente (`envelope`):** Para cada estación y componente, calcular tanto $R_{\max} = \max_k (\alpha_k R_k)$ como $R_{\min} = \min_k (\alpha_k R_k)$.

### 5.4 Deformada Elástica Curva

Para dibujar la estructura deformada con factor de amplificación visual $s$:

* Con $N$ estaciones ($N = 5$ en `pymas`) y desplazamientos globales $(u_x(\xi_m), u_y(\xi_m), u_z(\xi_m))$ en $\xi_m \in [0, 1]$, la posición deformada de cada estación es:
  $$\mathbf{P}_{\text{def}}(\xi_m) = \mathbf{P}_i + \xi_m (\mathbf{P}_j - \mathbf{P}_i) + s \begin{bmatrix} u_x(\xi_m) \\ u_y(\xi_m) \\ u_z(\xi_m) \end{bmatrix}$$
* Unir estos puntos mediante una curva suave (`THREE.CatmullRomCurve3`) para representar la curvatura real dentro de cada tramo.

---

## 6. Hoja de Ruta por Fases (Plan de Ejecución con Agente)

Ejecuta estas fases de forma secuencial. No avances a la siguiente fase hasta verificar todos los **Criterios de Aceptación** de la fase actual.

### Fase 0: Preparación de `fixtures/` y Metadatos en `pymas`

* **Objetivo:** Establecer los casos de prueba reales antes de generar código.
* **Tareas:**
  1. El usuario coloca sus archivos `.json` de referencia en `fixtures/`.
  2. (Opcional en `pymas`) Incluir `"units"`, `"roll_angle"` y `"stations"` en el exportador JSON de `pymas`.
* **Criterio de Aceptación:** Existen al menos 1 o más archivos `.json` válidos dentro de `fixtures/`.

### Fase 1: Cimientos del Proyecto, Inspección de `fixtures/` y Motor Matemático

* **Objetivo:** Inicializar `web/`, validar el esquema contra todos los JSON en `fixtures/` e implementar las funciones puras de cálculo estructural.
* **Tareas:**
  1. Leer y auditar todos los archivos en `fixtures/*.json`.
  2. Inicializar `web/` con Vite + React + TypeScript + Tailwind CSS + Zustand + Vitest.
  3. Configurar `vite.config.ts` con `base: "./"` para garantizar portabilidad total en GitHub Pages y subrutas locales.
  4. Crear `web/src/types/pymas.ts` y `web/src/engine/parser.ts` (normalización de diccionarios/arreglos, estaciones por defecto y validación robusta).
  5. Implementar `geometry.ts`, `superposition.ts` y `equilibrium.ts`.
  6. Escribir pruebas unitarias en Vitest que carguen automáticamente cada archivo de `fixtures/*.json` y verifiquen el parseo, las combinaciones y el equilibrio estático global ($\sum F_x, \sum F_y, \sum F_z$).
* **Criterio de Aceptación:** `npm test` pasa al 100% sobre todos los archivos reales de `fixtures/`.

### Fase 2: Viewport 3D Base, Drag & Drop y Módulo de Pre-proceso

* **Objetivo:** Construir el espacio de trabajo 3D interactivo listo para desplegarse como aplicación estática sin backend.
* **Tareas:**
  1. Implementar `DropZoneOverlay.tsx` para permitir arrastrar y soltar cualquier `.json` desde el explorador de archivos en cualquier momento, más un selector rápido de modelos en `public/samples/`.
  2. Configurar `SceneCanvas.tsx` con $Z$-up, `OrbitControls`, grilla en $Z = 0$, cubo de orientación y botones de vista rápida: **Isométrica 3D**, **Planta ($XY$)**, **Elevación Frontal ($XZ$)**, **Elevación Lateral ($YZ$)** y alternador **Perspectiva / Ortográfica**.
  3. Implementar `FrameMesh.tsx` con renderizado dual (**Alámbrico** y **Extruido 3D** `dy` $\times$ `dz` con control de opacidad) y **Codificación por Color** seleccionable:
     * Por **Material** (distinguiendo claramente elementos existentes vs. reforzamiento, p. ej. `MAT_E` vs `MAT_N`).
     * Por **Sección transversal**.
     * Por **Uniforme / Grupo**.
  4. Implementar `NodeMarkers.tsx` (simbología 3D de apoyos), `ReleaseMarkers.tsx` (rótulas en extremos con grados de libertad liberados) y `LoadVectors.tsx` (cargas nodales y distribuidas filtrables por patrón).
* **Criterio de Aceptación:** Cualquier JSON arrastrado al navegador se renderiza correctamente en $Z$-up con sus secciones extruidas, materiales diferenciados, apoyos, liberaciones y cargas.

### Fase 3: Módulo de Post-proceso 3D (Deformada, Diagramas y Reacciones)

* **Objetivo:** Visualizar los resultados del análisis estructural directamente sobre la escena 3D para cualquier patrón o combinación.
* **Tareas:**
  1. Conectar `ControlSidebar.tsx` al motor de superposición para seleccionar patrones base, combinaciones lineales y envolventes.
  2. Implementar `DeformedStructure.tsx`:
     * Curva elástica usando las estaciones de `internal_displacements` y deslizador de **Factor de Escala** (con auto-escala inteligente).
     * Malla "fantasma" indeformada en gris tenue.
     * Botón de **Animación Armónica** ($\sin(\omega t)$) y opción de **Mapa de Calor** ($\Vert U \Vert, u_x, u_y, u_z$).
  3. Implementar `ForceDiagrams3D.tsx` para proyectar en los planos locales de cada barra los 6 esfuerzos internos ($F_x, F_y, F_z, M_x, M_y, M_z$) con código de color por signo y etiquetas en valores pico.
  4. Implementar `ReactionVectors.tsx` y `EquilibriumBar.tsx` para mostrar reacciones en apoyos y el balance global de fuerzas.
* **Criterio de Aceptación:** Al cambiar entre patrones sísmicos, gravitacionales y combinaciones, la deformada curva y los diagramas 3D se actualizan al instante sin errores de plano local.

### Fase 4: Inspector 2D de Elemento y UX de Ingeniería

* **Objetivo:** Permitir la auditoría detallada barra por barra y nudo por nudo.
* **Tareas:**
  1. Selección interactiva por clic (*raycasting*) sobre cualquier barra o nudo en el viewport 3D con resaltado visual.
  2. Crear `ElementInspector.tsx` (ficha de propiedades, liberaciones, tabla de `end_actions` en extremos $I/J$, o tabla de desplazamientos y reacciones en nudos).
  3. Implementar `InternalForceChart2D.tsx` con gráficos SVG apilados de $F_x(x), V(x), M(x)$ y deflexión local $\delta(x)$ para $x \in [0, L]$, sincronizados con un **cursor deslizante** que proyecta un marcador luminoso sobre la barra en la escena 3D.
* **Criterio de Aceptación:** Hacer clic en una barra abre sus diagramas 2D exactos y mover el cursor sobre el gráfico 2D desplaza un marcador en tiempo real a lo largo de la barra 3D.

### Fase 5: Comparador de Fases, GitHub Pages y Paquete Python (`pymas_studio`)

* **Objetivo:** Completar el flujo de producción tanto para web pública (GitHub Pages) como para uso integrado desde `pymas` en Python.
* **Tareas:**
  1. **Modo Comparador de Modelos:** Cargar un segundo archivo JSON (ej. *Estado Original* vs. *Fase 3 Reparación*) para comparar desplazamientos máximos, derivas y demandas en elementos existentes (`MAT_E`).
  2. **Exportación de Entregables:** Captura PNG de alta resolución (fondo blanco limpio para memorias de cálculo) y exportación CSV de reacciones y envolventes.
  3. **Pipeline GitHub Pages (`.github/workflows/deploy-pages.yml`):** Workflow de GitHub Actions que compila `web/` (`npm run build`) y publica `web/dist/` automáticamente en GitHub Pages.
  4. **Paquete Python `python/pymas_studio`:**
     * Script de empaquetado (`npm run build:python`) que compila `web/dist/` y copia los archivos estáticos dentro de `python/pymas_studio/static/`.
     * Implementar `pymas_studio.show(source, port=0, open_browser=True)` aceptando: (a) ruta a un archivo `.json`, (b) un diccionario Python con el esquema `pymas`, o (c) un objeto modelo de `pymas` que implemente `.to_dict()` o `.export_json()`.
     * Levantar un servidor HTTP local (`ThreadingHTTPServer` en hilo daemon) que sirva el visor estático y exponga `/api/model.json`, abriendo `http://127.0.0.1:<port>/?autoload=1` en el navegador.
* **Criterio de Aceptación:**
  * El sitio estático en GitHub Pages funciona sin backend permitiendo arrastrar cualquier `.json`.
  * Desde cualquier carpeta del sistema, ejecutar `import pymas_studio; pymas_studio.show(modelo)` abre el navegador con el modelo renderizado en menos de 2 segundos.

---

## 7. Guía de Prompts para Trabajar con el Agente

1. **Prompt Fase 1:** *"Lee `PYMAS_STUDIO_PLAN.md`. Primero inspecciona todos los archivos JSON que puse en `fixtures/` para verificar el esquema real de `pymas`, y luego ejecuta únicamente la Fase 1: crea `web/`, los tipos en `src/types/pymas.ts`, los módulos matemáticos en `src/engine/` y las pruebas en Vitest contra `fixtures/`."*
2. **Prompt Fase 2:** *"La Fase 1 y sus tests pasaron. Ejecuta ahora la Fase 2 de `PYMAS_STUDIO_PLAN.md`: construye el viewport 3D en $Z$-up con soporte Drag & Drop de JSON, selector de samples, modo alámbrico y extruido (`dy` $\times$ `dz`), coloreado por material/sección, apoyos, rótulas de releases y vectores de carga."*
3. **Prompt Fase 3:** *"Ejecuta la Fase 3 de `PYMAS_STUDIO_PLAN.md`: implementa la deformada elástica curva con animación y mapa de calor, los diagramas 3D de los 6 esfuerzos internos y los vectores de reacción conectados al motor de combinaciones."*
4. **Prompt Fase 4:** *"Ejecuta la Fase 4 de `PYMAS_STUDIO_PLAN.md`: añade selección por clic en el viewport 3D y el panel inspector lateral con gráficos SVG 2D sincronizados con un marcador 3D sobre la barra."*
5. **Prompt Fase 5:** *"Ejecuta la Fase 5 de `PYMAS_STUDIO_PLAN.md`: implementa el modo comparador entre dos JSON, la exportación de capturas limpias, el workflow de GitHub Pages y el paquete instalable `python/pymas_studio` con `show()`."*