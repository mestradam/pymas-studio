import { useEffect, useRef, useState } from "react";
import { useModelStore } from "../../store/useModelStore";
import { isJsonFile } from "../../lib/utils";

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export interface GlobalDropState {
  active: boolean;
  /** Cantidad de JSON válidos observados en el último drag (para la pista). */
  jsonCount: number;
}

/**
 * Drag & drop global:
 *  - 1 JSON: reemplaza el modelo base A.
 *  - 2 JSON: el primero se carga como A y el segundo como B (comparador).
 *
 * Los archivos se validan y renderizan localmente; nada sale del navegador.
 */
export function useGlobalDrop(): GlobalDropState {
  const [dragging, setDragging] = useState(false);
  const [jsonCount, setJsonCount] = useState(1);
  const depth = useRef(0);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
      const items = Array.from(event.dataTransfer?.items ?? []).filter(
        (item) => item.kind === "file",
      );
      if (items.length > 0) setJsonCount(items.length);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      const jsonFiles = files.filter(isJsonFile);
      const usable = jsonFiles.length > 0 ? jsonFiles : files.slice(0, 1);
      if (usable.length === 0) return;

      void (async () => {
        const state = useModelStore.getState();
        if (usable.length >= 2) {
          // Secuencial: A debe quedar aplicado antes de resolver el caso de B.
          await state.loadFromFile(usable[0] as File);
          await useModelStore.getState().loadCompareFromFile(usable[1] as File);
        } else {
          await state.loadFromFile(usable[0] as File);
        }
      })();
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return { active: dragging, jsonCount };
}
