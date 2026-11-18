import { createRoot } from "react-dom/client";
import * as THREE from "three";
import App from "./App";
import "./index.css";

// PyMAS works in a global Z-up coordinate system. Three.js is Y-up by default,
// so every helper and geometry created from now on must share the same up axis.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró el contenedor #root.");

createRoot(container).render(<App />);
