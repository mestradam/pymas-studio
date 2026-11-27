import { visibleModel } from "../../engine/visibility";
import { useModelStore } from "../../store/useModelStore";
import type { PymasModel } from "../../types/pymas";

/** Vista filtrada de `model` con las barras visibles según el store. */
export function useVisibleModel<M extends PymasModel | null>(model: M): M {
  const visibility = useModelStore((state) => state.visibility);
  const upAxis = useModelStore((state) => state.upAxis);
  if (!model) return model;
  return visibleModel(model, visibility, upAxis) as M;
}
