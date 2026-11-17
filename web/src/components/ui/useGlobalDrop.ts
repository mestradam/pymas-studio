import { useEffect, useRef, useState } from "react";
import { useModelStore } from "../../store/useModelStore";
import { isJsonFile } from "../../lib/utils";

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Global drag & drop: any .json dropped anywhere in the window is loaded. */
export function useGlobalDrop(): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const loadFromFile = useModelStore((state) => state.loadFromFile);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
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
      const file = files.find(isJsonFile) ?? files[0];
      if (file) void loadFromFile(file);
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
  }, [loadFromFile]);

  return dragging;
}
